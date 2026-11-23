# Reviewed claims

Every file here is a claim a **person approved for publication**. Committing a
file to this directory is the approval — there is no other gate, and there is
deliberately no way for an automated process to add one.

`scripts/claim.mjs publish-set` republishes all of them on a schedule and
confirms each reads back. That is what makes Starcom's identity autonomous
without a machine ever deciding what is true: it keeps approved statements
reachable, which is a different act from making new ones.

Republishing matters even when nothing has changed. Relays churn and drop old
events, and a relay newly ADDED to the set never receives anything published
before it joined — The Record holds none of Starcom's history for exactly that
reason.

It does not make a claim look fresher. Weight decays from `method.observedTo`,
never from when the event was last sent, so a republish keeps a claim
retrievable without resetting its age. A republish that moved the clock would
be a lie told by a cron job.

To withdraw something published from here, delete the file **and** run
`scripts/claim.mjs retract` — removing the file stops it being republished, but
only a retraction tells consumers it was withdrawn.
