# Firebase Emulator Suite — Firestore, Auth, Storage running locally so
# the same `firebase-admin` code we ported from upstream works end-to-end
# without a real Firebase project.
#
# Built off node:20-bookworm-slim because the emulator needs:
#   • Node.js (for firebase-tools)
#   • A JRE (the emulators themselves are Java)
#
# Total image size hovers around 700 MB, of which Java is most of it.
# The image is built once and reused — startup time is ~10 sec after the
# first build.
FROM node:20-bookworm-slim

# Java runtime + cleanup. headless JRE is enough — no AWT / Swing.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
  && rm -rf /var/lib/apt/lists/*

# Firebase CLI: shipped as a single npm package; vendored globally so we
# can invoke `firebase emulators:start` from any working dir.
RUN npm install -g firebase-tools@13.29.1

WORKDIR /workspace

# Emulator UI + Firestore + Auth + Storage + Functions ports. See
# firebase.json at repo root for the canonical port assignments.
EXPOSE 4000 8080 9099 9199 5001

# Listen on all interfaces so the host can reach the emulators. The
# `--import` + `--export-on-exit` flags make Firestore data persist
# across container restarts (handy during development; for production
# the real Firebase project is the source of truth).
CMD ["firebase", "emulators:start", \
     "--project=demo-rakshsetu", \
     "--import=/workspace/.emu-data", \
     "--export-on-exit=/workspace/.emu-data"]
