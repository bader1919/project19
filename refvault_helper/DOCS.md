# RefVault helper

YouTube blocks cloud servers, so RefVault can't read captions or video descriptions itself.
This add-on runs on your Home Assistant at home and does it for your library, the same way
Music Assistant reaches YouTube: yt-dlp with proof-of-origin tokens from the
"YT Music PO Token Generator" add-on.

Options:
- `helper_url`: your private helper link from RefVault (Settings, PC helper).
- `pot_server`: the token generator address (default works with the YT Music PO Token Generator add-on).
