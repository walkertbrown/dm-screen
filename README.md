# DM Screen

Put the table on your players' phones. Start sharing and DM Screen gives you a link and a QR code; your players open it in any phone browser and see whose turn it is, the turn order, the battle map, the clocks and the last rolls, live, as you play from your notes. Nothing to install on their side, no accounts.

It reads what these plugins already do in your notes:

- [Quick Initiative](https://github.com/walkertbrown/quick-initiative): the turn order, whose turn it is, the round, hit points and conditions.
- [Tabletop Clocks](https://github.com/walkertbrown/tabletop-clocks): every clock in the open note when you start, and each one as you tick it.
- [Dice Tray](https://github.com/walkertbrown/dice-tray): the rolls you click.

## Share the table

Run **Share the table with players** (or click the cast icon in the ribbon). A window shows the link and its QR code. Put it on the screen for the table to scan, or copy the link into your group chat. The window has a line for the scene ("The mill at night") that shows at the top of the players' page.

From then on, every change goes to their phones a moment after you make it: a new turn, a hit, a condition, a clock ticked, a roll. The status bar says how many phones are watching. Click it to see the link again.

**Stop sharing the table** closes it. The players' page says the table has closed, and everything sent is deleted.

## Handouts

Show the players a letter, a riddle, a map or a portrait:

- **Show to players** in a picture's or a note's menu (or the **Show this note to players** command). A picture shows as it is. A note shows its words and the first picture in it. Its properties, `%% comments %%` and code blocks stay behind, so GM notes in the same note are safe.
- **Show to players** in the editor's menu, with text selected (or **Show the selected text to players**), shows just those words.

The handout sits at the top of the players' page until you show another or **Hide the handout from players**. A tap opens the picture full size. Pictures are shrunk to at most 1600 pixels a side, as JPEG, before they leave your vault.

Showing a handout starts sharing if it hadn't started.

## Battle map

A `battlemap` block draws a map in your note, with a grid and tokens (**Insert a battle map** puts one in to start from):

````
```battlemap
![[Mill cellar.png]] 12x8
Aria C6 blue
Borin D7 green
Goblin 1 I3 red
Goblin 2 J5 red
Bugbear K2 orange hidden
Ogre
```
````

- The first line is the picture and the grid, columns by rows. The picture is optional; without one you get a plain grid. The grid is at most 60 by 60.
- Every other line is a token: a name, a square (column letter, row number, like a chessboard), and a colour if you like (red, orange, yellow, green, cyan, blue, purple or pink). A `[[link]]` in the name works.
- A token with no square waits beside the map until you drag it on.
- `hidden` at the end of a line keeps that token off the players' phones until you take the word out. In your note it shows faded.

Drag a token to move it, or click it and then click a square. With a token chosen, the arrow keys move it a square at a time, and Delete takes it off the map. Each move writes the new square into its line, so the note always holds the map as it stands. Type `Goblin 3 F7 red; Wolf` in the box under the map to add tokens.

**Show to players** above the map sends it to their phones, under the turn order. The picture goes once, shrunk like a handout; after that only the squares go, as you move tokens. The token whose turn it is in Quick Initiative (matched by name) has a ring on the map, and a token that is down is greyed out. **Hide from players** (or **Hide the map from players**) takes the map and its picture down. One map shows at a time, beside any handout.

Not yet: fog of war, token pictures, measuring.

## What the players see

Only what you choose:

- **Players' hit points**: numbers, like `18/27`. Turn this off and they show no numbers.
- **Monsters' hit points**: words by default (*hurt*, *bloodied* at half or less, *down*), or numbers, or nothing.
- **Recent rolls**: none, 3, 5 or 10.

Nothing else from your vault is sent: no note text but the handouts you show, no monster stats, no file names but a handout's, and of a battle map only its picture, its grid and the tokens not marked `hidden`.

## Payment

**Payment is required for full access.** DM Screen costs $12 once, on itch.io. Without a key, a shared table is a free trial: it closes an hour after it opens, enough to try it with your group. With a key, it stays open all evening (until 12 hours pass with no changes).

After you buy, itch takes you to your download page. Copy that page's address (or the key at the end of it) into **Settings → DM Screen → Key** and click **Check**. Lost it? Type the email you bought with under **Lost your key?** and the key is mailed there. itch also emails your download page with the receipt.

The key is kept in your vault's plugin folder (`.obsidian/plugins/dm-screen/data.json`), so you paste it once per vault. If you share your whole vault folder with someone, the key goes with it.

## Network use

DM Screen uses the network, only while you are sharing:

- When you start sharing, it asks `https://bulkhead.bananafest-destiny.com/api/table/open` for a room. That server is run by the maker of this plugin.
- While you share, each change sends the table as described above to that room. The players' phones read it from there.
- A handout picture goes to the same room, shrunk first. Hiding it deletes it.
- A battle map you show sends its picture to the same room, shrunk first, and then its grid and the names, squares and colours of the tokens not marked `hidden`. Hiding it deletes the picture.
- When you stop, or after 12 hours with no changes (an hour from opening, on the free trial), the room and everything in it is deleted.
- With a key in settings, the key goes with each new table, and **Check** sends it on its own. The server asks itch once whether it is a DM Screen key and then keeps only a hash of it, and a count of how many tables it opened that day.
- **Lost your key?** sends the address you type. The server asks itch for that address's DM Screen key and mails it there. It keeps a hash of the address for an hour, so it mails once an hour at most, and never logs it.

The server keeps only the last table sent, the handout and map pictures showing, and a hash of the room's key. It keeps no accounts, no logs of who opened a room, and no IP addresses. Without a share running, DM Screen sends nothing at all.

## Install

From itch: [buy DM Screen](https://bananafestdestiny.itch.io/dm-screen) and download `dm-screen.zip`. Unzip it into `<your vault>/.obsidian/plugins/`, so the files land in `.obsidian/plugins/dm-screen/`, then turn it on under **Settings → Community plugins** and paste your key (see Payment).

By hand: copy `main.js`, `manifest.json` and `styles.css` from a release into `<your vault>/.obsidian/plugins/dm-screen/`, then turn it on under Community plugins.

## Build

```
npm install
npm test
npm run build
```
