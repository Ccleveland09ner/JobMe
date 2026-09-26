"use client";

/**
 * Setup form: display name, optional role/JD, mic check, Begin.
 *
 * TODO(slice 2): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Setup
 *
 * Begin does two things that must happen together:
 *   1. POST /api/sessions -> { sessionId, introLine, question }
 *   2. create the AudioContext (browsers need the user gesture - see
 *      lib/voice/audio-graph.ts), then route to /interview/[id]
 *
 * Role/JD text caps at ~2000 chars and is saved on the session, where it makes
 * question phrasing more specific.
 */

export function SetupForm() {
  return <form className="flex flex-col gap-4">{/* TODO(slice 2) */}</form>;
}
