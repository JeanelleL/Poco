# Poco

Read `README.md` first: it has the project goal, the direction the hardware
faces (which is the thing most easily got wrong), current status, the contract
between the app and the server, the file map and the planned next steps.

Quick facts:

- A robot penguin that helps autistic children read and regulate emotions.
  **Poco's camera and microphone face the FRIEND the child is talking to;
  everything Poco does comes out at the CHILD.**
- One repo, four parts: `src/` the iPad app (Vite + React 18 + TS, plain CSS),
  `server/` the laptop (Python 3.12 + uv), `servos/` and `led_matrix/` the robot.
- macOS, Apple Silicon. Node 22 and Python are installed; Xcode is not, so the
  `ios/` build cannot be run yet.
- Verify app changes with `npm run build`, and check the layout at 1180x820 and
  1024x768. Verify server changes by running the demo in `server/`.
- `src/poco/pocoClient.ts` is the source of truth for every shared id string.
  `server/poco/bridge/events.py` mirrors it; when they disagree, the TypeScript
  wins.
- Talk through bigger changes with the user before writing code.
