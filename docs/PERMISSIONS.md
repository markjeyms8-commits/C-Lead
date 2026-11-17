# Permission matrix

| Capability                                        | President                  | Vice President | Secretary          | Treasurer           | Student                                |
| ------------------------------------------------- | -------------------------- | -------------- | ------------------ | ------------------- | -------------------------------------- |
| Announcements / discussion approvals / moderation | Yes                        | Yes            | No                 | No                  | Own discussion submission only         |
| Accounts / imports / reset / revocation           | Yes                        | Yes            | No                 | No                  | Own password / sessions                |
| Assign non-President officer roles                | Yes                        | Yes            | No                 | No                  | No                                     |
| Assign/transfer President                         | Controlled DB process only | No             | No                 | No                  | No                                     |
| Terms / subjects / tasks                          | Yes                        | Yes            | Yes                | No                  | Assigned task progress before deadline |
| Attendance                                        | Yes                        | Yes            | Yes                | No                  | Own history and correction requests    |
| Approve changes older than 7 days                 | Yes                        | Yes            | No                 | No                  | No                                     |
| Contributions / reports                           | Yes                        | Yes            | No                 | Yes                 | Own status; anonymous totals           |
| Full student numbers                              | Yes                        | Yes            | Own only           | Own only            | Own only                               |
| Groups                                            | Override                   | Override       | Correct membership | Ordinary membership | Create/manage own groups               |
| Audit / analytics                                 | Yes                        | Yes            | No                 | No                  | No                                     |

Interpretation: VP inherits operational President capabilities, including non-President officer assignments, consistent with the explicit operational-backup requirement. Neither role can assign President in the application. One primary role per user in this foundation; multiple-role support requires an explicit later migration if requested. The frontend matrix is only navigation guidance; RLS and RPCs enforce access.
