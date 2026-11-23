# What happens to what you submit

Written before the intake surface exists, because a disclosure composed
afterwards tends to describe whatever was convenient to build.

This document is the text the intake screen must convey. It is deliberately
specific about what is **not** protected, because a submission page that lists
only its protections teaches people to trust it further than it has earned.

## What we do to your file

1. **We remove the metadata.** Photos from phones and cameras normally carry
   GPS coordinates accurate to a few metres, the device's serial number, and
   the exact second the shutter opened. We strip all of it — every EXIF, XMP
   and comment block from a JPEG; every text, timestamp and EXIF chunk from a
   PNG — and then check the result to confirm none survived.

2. **We do not re-encode the picture.** The image data itself is passed through
   unchanged. This keeps the file usable as evidence: re-encoding would destroy
   the compression traces that show whether a photograph has been altered.

3. **We refuse what we cannot clean.** Only JPEG and PNG are accepted. HEIC —
   what most iPhones produce by default — and TIFF both carry EXIF, and we do
   not accept them rather than pass them through unprocessed. **Convert to JPEG
   before submitting, and check that your conversion tool does not copy the
   metadata across.**

## What we record

A hash of the file before and after stripping, a list of what was removed, and
the hour it arrived. That is the whole record.

We do not record your filename, your IP address, your browser, your screen
size, your language, your timezone, a session identifier, or any key you hold.
The arrival time is rounded to the hour on purpose: a precise timestamp can be
matched against other logs to place one person at one keyboard.

## What this does NOT protect

Read this part twice.

- **Your network connection is not hidden.** Whoever carries your traffic, and
  whoever hosts what you connect to, can see that your address made the
  connection. Stripping metadata from a file does nothing about this. **If
  being identified as the submitter is dangerous for you, use Tor.**

- **The picture itself may identify you.** A reflection in a window, a shadow
  with your shape in it, a view only obtainable from your flat, a distinctive
  vehicle, a hand. We remove what the camera wrote *about* the photo; we cannot
  remove what is *in* it. Look at your image and ask what someone who wanted to
  find you would learn from it.

- **What is in the file's content is not examined.** A screenshot may contain
  your username, your open tabs, your notification bar, or your unread messages.

- **Publication is permanent.** Findings are broadcast to relays that we do not
  control and cannot recall. A retraction asks them to replace the claim; it
  cannot make copies already taken disappear. Assume that anything published
  stays published.

- **We cannot promise what happens next.** Once a submission becomes part of an
  analysis, other instances may republish conclusions drawn from it. The
  attestation format records how a conclusion was reached, not who provided the
  underlying material — but analysis is a human activity, and people talk.

## If you are at risk

Consider whether submitting at all is the right choice. There are situations
where the safest thing to do with evidence is to keep it, tell no one, and wait.

If you do submit: use Tor, submit from a device and network that are not yours,
convert the image yourself first, strip metadata yourself first as well rather
than relying on us alone, and look hard at what the picture shows before you
send it.

## Status

Written 2026-08-21, before any intake surface was built, per the Phase III.5
gate. **It has not yet been reviewed by anyone other than its author, and it
must be before intake opens.** Specifically it needs review by someone with
operational security experience and by someone who has actually received
sensitive submissions — the failure mode of a document like this is that it is
technically accurate and practically misleading.
