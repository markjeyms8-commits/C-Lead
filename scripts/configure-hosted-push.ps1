param(
  [Parameter(Mandatory)][string]$ProjectRef,
  [Parameter(Mandatory)][string]$ExpectedProjectRef,
  [Parameter(Mandatory)][string]$ContactEmail
)
$ErrorActionPreference = 'Stop'
if ($ProjectRef -cne $ExpectedProjectRef -or $ProjectRef -cnotmatch '^[a-z]{20}$') {
  throw 'Explicit project references must match exactly.'
}
if ($ContactEmail -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') {
  throw 'A valid technical contact email is required.'
}
$repo = Split-Path -Parent $PSScriptRoot
if ((Get-Location).Path -ne $repo) { throw 'Run from the C-LEAD repository root.' }
$linked = (Get-Content -LiteralPath (Join-Path $repo 'supabase/.temp/project-ref') -Raw).Trim()
if ($linked -cne $ProjectRef) { throw 'The linked project does not match the explicit target.' }
$privateDirectory = Join-Path $env:LOCALAPPDATA 'C-LEAD'
$backup = Join-Path $privateDirectory "$ProjectRef-push.dpapi"
$temporary = Join-Path $repo 'supabase/.temp'
$secretFile = Join-Path $temporary 'push-setup.env'
$sqlFile = Join-Path $temporary 'push-setup.sql'
$publicFile = Join-Path $temporary 'push-public-key.txt'

function Invoke-SafeCli([string[]]$CliArguments, [string]$Failure) {
  $result = & npx --yes supabase @CliArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw $Failure }
  return ($result | Out-String)
}
function Get-SecretMetadata {
  $json = & npx --yes supabase secrets list --project-ref $ProjectRef --output json
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect secret metadata.' }
  return ($json | ConvertFrom-Json)
}
function Get-Digest([string]$Value) {
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Value))).ToLowerInvariant()
}
$metadata = Get-SecretMetadata
$names = @('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CLEAD_SCHEDULER_SECRET')
if (Test-Path -LiteralPath $backup) {
  $secure = Get-Content -LiteralPath $backup -Raw | ConvertTo-SecureString
  $configuration = [Net.NetworkCredential]::new('', $secure).Password | ConvertFrom-Json
} else {
  if ($metadata | Where-Object { $_.name -in $names }) {
    throw 'Push secrets already exist. Recover the matching private backup; do not rotate them.'
  }
  $generated = & node --input-type=module -e 'import {createECDH,randomBytes} from "node:crypto";const e=createECDH("prime256v1");e.generateKeys();process.stdout.write(JSON.stringify({publicKey:e.getPublicKey().toString("base64url"),privateKey:e.getPrivateKey().toString("base64url"),scheduler:randomBytes(32).toString("hex")}));'
  if ($LASTEXITCODE -ne 0) { throw 'Key generation failed.' }
  $configuration = $generated | ConvertFrom-Json
  $configuration | Add-Member NoteProperty projectRef $ProjectRef
  $configuration | Add-Member NoteProperty subject "mailto:$ContactEmail"
  New-Item -ItemType Directory -Force -Path $privateDirectory | Out-Null
  $encrypted = ($configuration | ConvertTo-Json -Compress) | ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString
  [IO.File]::WriteAllText($backup, $encrypted)
}
if ($configuration.projectRef -cne $ProjectRef -or $configuration.subject -cne "mailto:$ContactEmail" -or $configuration.publicKey -cnotmatch '^[A-Za-z0-9_-]{87}$' -or $configuration.privateKey -cnotmatch '^[A-Za-z0-9_-]{43}$' -or $configuration.scheduler -cnotmatch '^[a-f0-9]{64}$') {
  throw 'Private backup does not match the target or expected key format.'
}
$values = @{
  VAPID_PUBLIC_KEY = $configuration.publicKey
  VAPID_PRIVATE_KEY = $configuration.privateKey
  VAPID_SUBJECT = $configuration.subject
  CLEAD_SCHEDULER_SECRET = $configuration.scheduler
}
foreach ($item in $metadata) {
  if ($item.name -in $names -and $item.value -cne (Get-Digest $values[$item.name])) {
    throw 'Existing remote push configuration differs from the backup. Refusing rotation.'
  }
}
try {
  [IO.File]::WriteAllText($secretFile, (($names | ForEach-Object { "$_=$($values[$_])" }) -join "`n"), [Text.UTF8Encoding]::new($false))
  $null = Invoke-SafeCli @('secrets','set','--project-ref',$ProjectRef,'--env-file',$secretFile,'--yes') 'Could not configure push secrets. No secret values were logged.'
  $verified = Get-SecretMetadata
  foreach ($name in $names) {
    if (($verified | Where-Object name -eq $name).value -cne (Get-Digest $values[$name])) { throw 'Remote push secret verification failed.' }
  }
  Write-Output 'Push secret metadata matches the encrypted local backup.'
  $null = Invoke-SafeCli @('functions','deploy','dispatch-notifications','--project-ref',$ProjectRef,'--use-api','--yes') 'Dispatcher deployment failed.'
  Write-Output 'Notification dispatcher deployed.'
  $sql = @'
begin;
select pg_advisory_xact_lock(hashtext('clead-push-setup'));
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $setup$
begin
  if exists(select 1 from vault.decrypted_secrets where name='clead_scheduler_secret' and decrypted_secret<>'__SCHEDULER__') then
    raise exception 'Existing scheduler credential does not match';
  end if;
  if not exists(select 1 from vault.secrets where name='clead_scheduler_secret') then
    perform vault.create_secret('__SCHEDULER__','clead_scheduler_secret','C-LEAD notification dispatcher authorization');
  end if;
end $setup$;
select cron.schedule('clead-notification-dispatch','* * * * *', $job$
  select net.http_post(
    url := 'https://__PROJECT__.supabase.co/functions/v1/dispatch-notifications',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='clead_scheduler_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 100000
  );
$job$);
commit;
'@
  $sql = $sql.Replace('__SCHEDULER__', $configuration.scheduler).Replace('__PROJECT__', $ProjectRef)
  [IO.File]::WriteAllText($sqlFile, $sql, [Text.UTF8Encoding]::new($false))
  $null = Invoke-SafeCli @('db','query',"--remote=$ProjectRef",'--file',$sqlFile,'--output','json','--yes') 'Scheduler configuration failed. Existing classroom records were not modified.'
  [IO.File]::WriteAllText($publicFile, $configuration.publicKey, [Text.UTF8Encoding]::new($false))
  Write-Output 'Minute-by-minute scheduler configured with its credential in Supabase Vault.'
  Write-Output "Public frontend key saved to $publicFile"
  Write-Output 'Private keys remain in Supabase and the encrypted operator backup. Device opt-in and frontend configuration are still required.'
} finally {
  foreach ($path in @($secretFile, $sqlFile)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  }
}
