# Setting up fal (optional)

You only need this if you want your agent to make pictures, sounds, music, short clips or 3D models for your game.
You can make a whole game without it.

## What fal is

fal.ai is a website that runs image, sound and video models for you. Your agent sends it a description ("a lighthouse
on a cliff at dusk") and gets back a picture. **Each one costs real money**, taken from a balance you put on your fal
account. Rough examples:

- one style picture: about 15 cents
- a 5-second video clip: about 80 cents
- a short sound effect: less than 1 cent
- 30 seconds of music: about 30 cents

Prices change. The kit always shows the cost and asks before it spends anything, and it never goes over the budget
you set.

## Make an account and add a balance

1. Open **fal.ai** in your web browser.
2. Click **Sign up** and make an account (you can use a Google or GitHub account).
3. Open the **Billing** page (in the menu on your dashboard).
4. Add a small balance. **$10 is plenty to start.** Do not turn on automatic top-ups.

## Make a key

A key is a long password that lets the kit use your fal account.

1. Open **fal.ai/dashboard/keys**.
2. Click **Add key** (or **Create key**).
3. Give it a name, for example `my game kit`.
4. Click **Create**.
5. Click the copy button next to the key. fal shows the whole key only once, so keep this page open until the
   next part is done.

## Put the key in the `.env` file

The key goes into a small text file called `.env` in the kit's folder. That file stays on your computer: it is
never uploaded and never shared.

1. Ask your agent: **"Make the .env file for my fal key."** It copies `.env.example` to `.env` for you. (It will
   not ask for the key.)
2. Open the kit's folder.
   - On a Mac, in Finder, press **Command + Shift + .** (the full stop key) to show hidden files. Files whose names
     start with a dot are hidden until you do this.
   - On Windows, the file is visible as it is.
3. Open `.env` with a plain text editor.
   - Mac: right-click `.env`, choose **Open With**, then **TextEdit**.
   - Windows: right-click `.env`, choose **Open with**, then **Notepad**.
4. Find the line `FAL_KEY=`.
5. Click right after the `=` sign and paste the key. The line should look like `FAL_KEY=abc123...` with no spaces
   and no quote marks.
6. Save the file (**Command + S** on a Mac, **Ctrl + S** on Windows) and close it.
7. Tell your agent: **"I added my fal key."** It checks that the key is there without showing it.

## Never paste the key into the chat

Anyone who has your key can spend your fal balance. Chats are stored, and an agent may copy what you paste into
notes or files that end up shared. So:

- Never paste the key into the chat, an email or a message.
- Your agent will never ask for it. If something asks you for it in the chat, say no.
- If you did paste it somewhere by mistake: open **fal.ai/dashboard/keys**, delete that key, make a new one, and put
  the new one in `.env`.

## Set your budget

The kit will not spend anything until you set a budget. It starts at $0, which means "off".

1. Decide the most you are happy to spend on this game, for example $10.
2. Tell your agent: **"Set my fal budget to $10."**

It writes that number into `my-game/helper.json` (the setting is called `falCapUSD`). The kit refuses any batch that
would go over it. To see what you have spent so far, ask your agent to show the fal status, or open
`my-game/paid-ledger.md`, which lists every paid call.

## Turn generation off

1. Tell your agent: **"Turn fal generation off."**

It sets the budget back to $0. Nothing can be generated until you set a budget again. Your key stays where it is.

## Remove the key

1. Open `.env` again (steps above).
2. Delete everything after `FAL_KEY=` so the line is just `FAL_KEY=`.
3. Save and close the file.
4. Open **fal.ai/dashboard/keys** and delete the key there too. Now it cannot be used anywhere, even if a copy
   exists.
