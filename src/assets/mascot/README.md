# Ci artwork and agreed UI references

The two boards in `references/` are the user's agreed visual references. Their example people, counts and dates are design examples only, never application seed data.

`ci-welcome.png` was generated with the built-in image-generation tool using those boards as references: sage-green and cream fur, pink ears, a floppy forest-green wizard hat with gold trim and star, happy face, little paws and a curled tail. The former geometric SVG was a temporary illustration, not the agreed character.

Generation prompt: faithfully recreate the smiling Ci leaning its paws on the home-screen panel; preserve the reference's chibi proportions, fur pattern, floppy hat, dark outlines and soft illustrated shading; isolate on transparency without phone, UI, lettering or books.

`src/components/common/CiMascot.vue` loads this image with localized alternative text. `PageHero.vue` reuses it for compact page banners. The original boards are documentation assets and are not imported into the app bundle.
