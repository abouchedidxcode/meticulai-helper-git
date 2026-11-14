/**
 * Shared types (JSDoc only; this file exports nothing at runtime).
 *
 * Coordinate conventions (everything the engine consumes and produces):
 *  - screen space: x right, y down, 0..1 of the *mirrored* (selfie) camera image, so moving your
 *    hand to your right moves it right on screen; z is MediaPipe's relative depth (smaller = closer).
 *  - world space (optional, more accurate): MediaPipe world landmarks in metres, mirrored the same way.
 *  - handedness is the user's real hand.
 *
 * @typedef {{x:number, y:number, z:number}} Vec3
 *
 * @typedef {object} HandInput One hand as fed to the engine.
 * @property {Vec3[]} landmarks 21 MediaPipe landmarks in screen space.
 * @property {Vec3[]} [world] 21 world landmarks (metres), mirrored like `landmarks`. Strongly recommended.
 * @property {'Left'|'Right'} handedness
 * @property {number} [aspect] Camera image width / height (screen landmarks are non-isotropic without it).
 * @property {number} [id] Stable id if the caller tracks hands itself; otherwise the engine matches by position.
 *
 * @typedef {object} HandFeatures Everything measured about one hand in one frame. All 0..1 unless noted.
 * @property {number[]} curl Bend per finger (thumb, index, middle, ring, pinky): 0 straight .. 1 fully curled.
 * @property {number} thumbOut Thumb tip away from the palm (0 tucked .. 1 sticking out).
 * @property {number[]} tipGap Thumb tip to fingertip distance / palm length, for index, middle, ring, pinky.
 * @property {number[]} spread Angle (radians) between adjacent fingers: index-middle, middle-ring, ring-pinky.
 * @property {number} facing +1 palm facing the camera, -1 back of the hand facing it, 0 edge-on.
 * @property {number} roll Hand tilt in the image plane, radians (0 = fingers up, + = leaning right).
 * @property {{x:number,y:number}} pointDir Unit direction (screen) the index finger points.
 * @property {{x:number,y:number}} thumbDir Unit direction (screen) the thumb points.
 * @property {{x:number,y:number}} center Palm centre in screen space.
 * @property {number} size Wrist to middle knuckle length in screen heights (bigger = closer to the camera).
 * @property {number} openness Mean extension of the four fingers (1 = fully open).
 *
 * @typedef {'ext'|'curl'|'half'|'notcurl'|'notext'|'any'} FingerRule Per-finger requirement in a pose.
 *
 * @typedef {object} PoseDef A static hand shape, defined as data so games can add their own.
 * @property {string} id
 * @property {string} name
 * @property {string} hint How to make it (show this to players).
 * @property {FingerRule[]} fingers thumb, index, middle, ring, pinky.
 * @property {(f: HandFeatures) => number} [extra] Extra soft constraint 0..1, multiplied into the score.
 * @property {boolean} [experimental] Experimental poses are hidden when config.pose.experimental is false.
 *
 * @typedef {object} HandResult
 * @property {number} id Engine-assigned stable id (0, 1, ...) for the life of the hand.
 * @property {'Left'|'Right'} handedness
 * @property {HandFeatures} features
 * @property {string|null} pose Stable (debounced) pose id, or null.
 * @property {number} confidence Its current score.
 * @property {Record<string, number>} scores Raw score of every pose this frame.
 * @property {number} heldMs Milliseconds the current pose has been held.
 * @property {{x:number,y:number}} velocity Smoothed palm velocity, screen units / s.
 * @property {number} pinch Pinch strength 0..1 (thumb-index).
 * @property {Vec3[]} landmarks Smoothed screen landmarks.
 *
 * @typedef {'pose'|'motion'|'two-hand'} GestureKind
 *
 * @typedef {object} GestureEvent
 * @property {GestureKind} kind
 * @property {string} name e.g. 'fist', 'swipe-left', 'clap'.
 * @property {'start'|'end'} [phase] Pose events only.
 * @property {number} [hand] Hand id (undefined for two-hand gestures).
 * @property {number} t
 * @property {Record<string, number|string>} [data]
 *
 * @typedef {object} TwoHandState
 * @property {boolean} present
 * @property {number} distance Distance between palm centres (screen).
 * @property {number} angle Angle of the line from the left-most hand to the right-most, radians.
 * @property {number} zoom distance / distance when the current two-hand grip began (1 when none).
 *
 * @typedef {object} GestureFrame
 * @property {number} t
 * @property {HandResult[]} hands
 * @property {TwoHandState} twoHand
 * @property {GestureEvent[]} events
 */
export {};
