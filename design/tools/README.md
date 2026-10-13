# Rebuilding the recruiter model

The app only needs `public/models/recruiter.glb`, which is committed. **You do
not need anything in this folder to run JobMe.** Use it only to change the
recruiter: different clothes, a new animation, a different avatar.

## 1. Get the source files

They are large and not in git (see `.gitignore`). Put them here:

```
design/avatar-src/
├── brunette.glb                  the recruiter
├── avaturn.glb                   donor of the suit, shirt and belt
└── animations/
    └── Sitting Idle.fbx          Mixamo clip
```

- **`brunette.glb`, `avaturn.glb`:** sample avatars from the TalkingHead
  project (MIT, see `THIRD_PARTY_NOTICES.md`), in its `avatars/` folder. Or
  ask a teammate for the shared copies.
- **`Sitting Idle.fbx`:** from [mixamo.com](https://www.mixamo.com) (free
  Adobe account). Search "Sitting Idle" and download it with these settings:
  - Format: **FBX Binary**
  - Skin: **Without Skin**
  - Frames per second: **30**
  - Keyframe reduction: **none**

## 2. Tools

- [Blender](https://www.blender.org) 5.x. On Windows:
  `winget install BlenderFoundation.Blender`
- Node, which the project already uses. `npx` fetches gltf-transform.

## 3. Build

From the repo root (on Windows, the Blender path is usually
`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`):

```bash
# a) Dress the recruiter in the suit
blender -b --factory-startup --python design/tools/dress_recruiter.py -- \
  design/avatar-src/brunette.glb design/avatar-src/avaturn.glb \
  design/avatar-src/build/recruiter-dressed.glb

# b) Retarget the Mixamo clip(s) onto her skeleton and bake them in
blender -b --factory-startup --python design/tools/bake_animation.py -- \
  design/avatar-src/build/recruiter-dressed.glb \
  design/avatar-src/build/recruiter-animated.glb \
  "design/avatar-src/animations/Sitting Idle.fbx"

# c) Compress for the web (~4.4 MB -> ~1.1 MB) into the app
npx @gltf-transform/cli@4.5.1 optimize \
  design/avatar-src/build/recruiter-animated.glb public/models/recruiter.glb \
  --compress meshopt --texture-compress webp --texture-size 1024
```

Then check the result at `http://localhost:3000/dev/recruiter` (`npm run dev`).

## What each step does

- **`dress_recruiter.py`** poses the donor's skeleton onto the recruiter's
  joints, so the suit deforms into her shape. It then re-binds the suit to
  her skeleton (the bone names match, so the weights carry over) and drops
  the original gym outfit.
- **`bake_animation.py`** retargets each Mixamo clip from Mixamo's T-pose
  skeleton to her A-pose skeleton, and bakes it in as a named animation. The
  room plays the first one.
- The face shapes (blink, visemes, smile) are untouched by both steps; the
  room drives them live (`src/components/room/Recruiter3D.tsx`).
