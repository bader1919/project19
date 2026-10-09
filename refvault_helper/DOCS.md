# RefVault helper

YouTube blocks cloud servers, so RefVault can't read captions or video descriptions itself.
This add-on runs on your Home Assistant at home and does it for your library, the same way
Music Assistant reaches YouTube: yt-dlp with proof-of-origin tokens from the
"YT Music PO Token Generator" add-on.

Options:
- `helper_url`: your private helper link from RefVault (Settings, PC helper).
- `pot_server`: the token generator address (default works with the YT Music PO Token Generator add-on).
- `cookies_file`: optional YouTube cookies (Netscape `cookies.txt` format), default
  `/share/refvault/cookies.txt`. Only needed if YouTube starts asking this connection to
  "confirm you're not a bot". Export them from a browser signed in to YouTube (a spare Google
  account is safest) with an extension such as "Get cookies.txt LOCALLY", and put the file in
  the `share/refvault` folder (Samba or File editor add-on). The add-on only reads it.

If YouTube blocks your connection, the helper pauses (30 minutes, then longer) instead of
retrying, which lets the block clear on its own.
