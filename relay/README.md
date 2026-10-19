# Save relay

A small Cloudflare Worker that lets everyone signed in to the Action Database save, without a GitHub key of their own. It holds one GitHub key as a secret, passes the app's reads and saves through to the data repository only, and keeps the accounts (email and password). The data repository can then stay private.

Cloudflare's free plan covers it: 100 000 requests a day.

## Set it up (about 10 minutes)

1. **Make the GitHub key.** On github.com go to Settings, Developer settings, Fine grained tokens, Generate new token. Name it "Action Database relay". Set Expiration to the longest you're happy with. Under Repository access pick Only select repositories, then `bijankle/action-kanban-data`. Under Permissions, Repository permissions, set Contents to Read and write. Generate it and copy it (it starts `github_pat_`).
2. **Make the worker.** Sign up at dash.cloudflare.com (free). Go to Workers & Pages, Create, Create Worker. Name it `action-database` and Deploy. Then Edit code, delete what's there, paste in all of [worker.js](worker.js), and Deploy.
3. **Give it the key.** On the worker go to Settings, Variables and Secrets, Add. Type Secret, name `GH_TOKEN`, value: the GitHub key. Save.
4. **Optional, recommended: a team code.** Add another Secret named `TEAM_CODE` with a short word your team will know. Anyone making an account has to enter it, so strangers who find the site can't sign up and edit.
5. **Copy the worker's address.** It looks like `https://action-database.<your-name>.workers.dev`. Send it to Claude to build into the app, or paste it into the app under File, Settings, Save server.

## How accounts work

The first time someone signs in, they enter their email, their details and a password (8 characters or more), plus the team code if there is one. After that, any computer just asks for their email and password. A sign in lasts 90 days on each computer.

Passwords are kept only as salted PBKDF2 hashes in `data/auth.json` in the data repository. The relay never sends that file out.

To reset a forgotten password, open `data/auth.json` on GitHub, delete that person's entry and commit. They then set a new password the next time they sign in.

## Notes

The relay only touches the data repository, and only what reading and saving need. Saving needs a sign in; reading doesn't. Photos and attachments are cached at Cloudflare, because their addresses never change.
