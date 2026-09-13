"""Run python -m backend.connect_dropbox to authorize the owner's Dropbox once."""
import getpass
import os
import webbrowser
from pathlib import Path

from dotenv import dotenv_values, set_key
from dropbox import DropboxOAuth2FlowNoRedirect

REQUIRED_SCOPES = frozenset({"files.content.write", "files.content.read"})


def main():
    env_path = Path(__file__).with_name(".env")
    # Setup edits this file, so a stale shell variable must not select another app.
    settings = {**os.environ, **dotenv_values(env_path)}
    key = (settings.get("DROPBOX_APP_KEY") or "").strip()
    secret = (settings.get("DROPBOX_APP_SECRET") or "").strip()
    if not key or not secret:
        raise SystemExit("Add DROPBOX_APP_KEY and DROPBOX_APP_SECRET to backend/.env first. Create the app at https://www.dropbox.com/developers/apps (App Folder access).")
    flow = DropboxOAuth2FlowNoRedirect(
        key, secret, token_access_type="offline",
        # Omitting scope asks Dropbox for the permissions saved in App Console.
        # Check the actual grant below before persisting credentials.
        timeout=30,
    )
    url = flow.start()
    print(f"Using App key: {key} (compare with your Dropbox app's Settings tab).")
    print("Requesting the permissions saved in that app's Permissions tab.")
    print("Enable files.content.read and files.content.write there, then click Submit.")
    print("Opening Dropbox. Review the permissions and approve using the owner's account.")
    print("If the browser does not open, copy this entire URL:")
    print(url)
    try:
        webbrowser.open(url)
    except webbrowser.Error:
        pass  # The printed URL also works on servers without a browser.
    code = getpass.getpass("Paste the authorization code here (hidden): ").strip()
    if not code:
        raise SystemExit("No authorization code entered; no credentials were saved.")
    try:
        result = flow.finish(code)
    except Exception as exc:
        raise SystemExit(f"Dropbox authorization failed ({type(exc).__name__}). Try again; no credentials were saved.") from None
    if not result.refresh_token:
        raise SystemExit("Dropbox did not issue a refresh token. Run setup again.")
    granted_scopes = result.scope or []
    if isinstance(granted_scopes, str):
        granted_scopes = granted_scopes.split()
    missing = REQUIRED_SCOPES - set(granted_scopes)
    if missing:
        raise SystemExit(
            "Dropbox authorization succeeded, but the app did not grant: "
            + ", ".join(sorted(missing))
            + f". In App Console, select the app with App key {key}, enable these "
            "permissions, click Submit, and rerun setup. No credentials were saved."
        )
    set_key(str(env_path), "DROPBOX_REFRESH_TOKEN", result.refresh_token)
    set_key(str(env_path), "JOURNAL_MEDIA_STORAGE", "dropbox")
    print("Dropbox connected. Refresh token saved in backend/.env. Restart FastAPI, then migrate existing article media if needed.")


if __name__ == "__main__":
    main()
