import type { PartialPose } from '../lib/pose';

export type Category =
  | 'stance'
  | 'footwork'
  | 'punches'
  | 'kicks'
  | 'knees'
  | 'elbows'
  | 'defense'
  | 'clinch';

export type Level = 'beginner' | 'intermediate';

export interface Phase {
  label: string;
  pose: PartialPose;
  /** Transition time into this pose, in ms at 1x speed. */
  ms: number;
}

export interface Technique {
  id: string;
  name: string;
  /** Number code used in callouts (1 = jab, 2 = cross, ...). */
  code?: string;
  /** Short spoken/displayed callout name. */
  call: string;
  category: Category;
  level: Level;
  summary: string;
  cues: string[];
  mistakes: string[];
  phases: Phase[];
  /** Whether this can be used inside a combo. */
  strike: boolean;
  videoQuery: string;
}

export const CATEGORIES: { id: Category; name: string; blurb: string }[] = [
  { id: 'stance', name: 'Stance & Guard', blurb: 'The base everything is built on.' },
  { id: 'footwork', name: 'Footwork', blurb: 'Move without losing your base.' },
  { id: 'punches', name: 'Punches', blurb: 'The numbered strikes 1–6.' },
  { id: 'kicks', name: 'Kicks', blurb: 'Teeps and roundhouse kicks.' },
  { id: 'knees', name: 'Knees', blurb: 'Close-range power.' },
  { id: 'elbows', name: 'Elbows', blurb: 'Short, sharp, cutting strikes.' },
  { id: 'defense', name: 'Defense', blurb: 'Checks, parries, blocks and evasions.' },
  { id: 'clinch', name: 'Clinch', blurb: 'Control the head, land the knees.' },
];

const RETURN: Phase = { label: 'Return to guard', pose: {}, ms: 380 };

export const TECHNIQUES: Technique[] = [
  // ---------- Stance & guard ----------
  {
    id: 'stance',
    name: 'Stance & Guard',
    call: 'Guard',
    category: 'stance',
    level: 'beginner',
    strike: false,
    summary:
      'Orthodox stance: left foot forward, feet about shoulder-width, weight mostly on the rear leg so the lead leg is light enough to teep or check.',
    cues: [
      'Feet shoulder-width, lead foot slightly turned in',
      'Weight ~60–70% on the rear leg, lead heel light',
      'Hands high at brow level, elbows tucked',
      'Chin down, eyes looking through your gloves',
      'Stay tall — Muay Thai stance is more upright than boxing',
    ],
    mistakes: ['Hands dropping to chest height', 'Standing square with feet in line', 'Locking the knees'],
    phases: [
      { label: 'Guard', pose: {}, ms: 300 },
      { label: 'Soft bounce', pose: { leadKnee: -24, rearKnee: -20, leadHip: 24, rearHip: -16 }, ms: 450 },
      { label: 'Guard', pose: {}, ms: 450 },
    ],
    videoQuery: 'muay thai stance and guard for beginners',
  },

  // ---------- Footwork ----------
  {
    id: 'step',
    name: 'Step & Slide',
    call: 'Step',
    category: 'footwork',
    level: 'beginner',
    strike: false,
    summary: 'Move forward and back without crossing your feet: the foot closest to where you are going moves first.',
    cues: [
      'Moving forward: lead foot steps, rear foot follows the same distance',
      'Moving back: rear foot steps, lead foot follows',
      'Short steps — never cross or bring the feet together',
      'Keep the guard up while you move',
    ],
    mistakes: ['Crossing the feet', 'Bouncing too high', 'Leaning the head forward ahead of the feet'],
    phases: [
      { label: 'Lead foot steps forward', pose: { x: 10, leadHip: 30, rearHip: -30 }, ms: 350 },
      { label: 'Rear foot follows', pose: { x: 16 }, ms: 300 },
      { label: 'Rear foot steps back', pose: { x: 6, leadHip: 30, rearHip: -32 }, ms: 350 },
      { label: 'Lead foot follows', pose: { x: 0 }, ms: 300 },
    ],
    videoQuery: 'muay thai footwork basics step and slide',
  },
  {
    id: 'switch',
    name: 'Switch Stance',
    call: 'Switch',
    category: 'footwork',
    level: 'intermediate',
    strike: false,
    summary: 'A quick hop that swaps your feet, used to load the lead leg for a switch kick or knee.',
    cues: ['Small, quick hop — just enough to swap the feet', 'Hands stay up the whole time', 'Land balanced, ready to fire'],
    mistakes: ['Jumping too high', 'Dropping hands during the switch'],
    phases: [
      { label: 'Hop & swap', pose: { leadHip: -20, rearHip: 18, leadKnee: -10, rearKnee: -12 }, ms: 260 },
      { label: 'Hold', pose: { leadHip: -20, rearHip: 18, leadKnee: -10, rearKnee: -12 }, ms: 400 },
      { label: 'Swap back', pose: {}, ms: 260 },
    ],
    videoQuery: 'muay thai switch stance footwork',
  },

  // ---------- Punches ----------
  {
    id: 'jab',
    name: 'Jab',
    code: '1',
    call: 'Jab',
    category: 'punches',
    level: 'beginner',
    strike: true,
    summary: 'A straight punch with the lead hand. Your range finder and set-up for everything else.',
    cues: [
      'Punch straight from the guard, turn the fist over at the end',
      'Rear hand stays glued to the cheek',
      'Lead shoulder rises to protect the chin',
      'Snap it back along the same line',
    ],
    mistakes: ['Pulling the hand back before punching ("telegraphing")', 'Dropping the rear hand', 'Reaching with the head'],
    phases: [
      { label: 'Extend', pose: { leadShoulder: 92, leadElbow: 0, torso: 10, x: 3 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai jab technique tutorial',
  },
  {
    id: 'cross',
    name: 'Cross',
    code: '2',
    call: 'Cross',
    category: 'punches',
    level: 'beginner',
    strike: true,
    summary: 'A straight power punch with the rear hand, driven by the rear foot and hip rotation.',
    cues: [
      'Pivot on the ball of the rear foot, heel turns out',
      'Rotate the hip and shoulder through the target',
      'Lead hand comes back to protect the face',
      'Return to guard immediately',
    ],
    mistakes: ['Arm-only punch without hip rotation', 'Leaning too far over the lead knee', 'Dropping the lead hand'],
    phases: [
      { label: 'Pivot & extend', pose: { rearShoulder: 94, rearElbow: 0, torso: 16, x: 7, rearHip: -14, leadShoulder: 30, leadElbow: 135 }, ms: 190 },
      RETURN,
    ],
    videoQuery: 'muay thai cross punch technique',
  },
  {
    id: 'lead-hook',
    name: 'Lead Hook',
    code: '3',
    call: 'Hook',
    category: 'punches',
    level: 'beginner',
    strike: true,
    summary: 'A short horizontal punch with the lead hand, powered by turning the lead hip and foot.',
    cues: [
      'Elbow up to shoulder height, arm bent ~90°',
      'Turn the lead foot and hip in together',
      'Keep it tight — the fist travels a short arc',
      'Rear hand stays home on the cheek',
    ],
    mistakes: ['Looping it wide', 'Dropping the elbow', 'Not turning the lead foot'],
    phases: [
      { label: 'Load the lead hip', pose: { torso: 0, leadShoulder: 70, leadElbow: 95 }, ms: 150 },
      { label: 'Turn through', pose: { torso: 8, leadShoulder: 88, leadElbow: 88, x: 3 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai lead hook technique',
  },
  {
    id: 'rear-hook',
    name: 'Rear Hook',
    code: '4',
    call: 'Rear hook',
    category: 'punches',
    level: 'beginner',
    strike: true,
    summary: 'The rear-hand hook: a big rotation from the rear foot, often thrown after a lead hook or jab.',
    cues: ['Pivot on the rear foot like the cross', 'Elbow up, arm bent, fist level with the target', 'Lead hand covers your face'],
    mistakes: ['Swinging wide like a haymaker', 'Squaring up and staying there'],
    phases: [
      { label: 'Pivot & hook', pose: { rearShoulder: 88, rearElbow: 88, torso: 14, x: 6, rearHip: -14, leadShoulder: 30, leadElbow: 135 }, ms: 210 },
      RETURN,
    ],
    videoQuery: 'muay thai rear hook punch',
  },
  {
    id: 'lead-uppercut',
    name: 'Lead Uppercut',
    code: '5',
    call: 'Uppercut',
    category: 'punches',
    level: 'beginner',
    strike: true,
    summary: 'A rising punch with the lead hand. Dip into the lead leg, then drive up through the target.',
    cues: ['Small dip into the lead knee first', 'Drive up with the legs, palm facing you', 'Short range — don\'t wind it up'],
    mistakes: ['Dropping the hand low to "load" it', 'Leaning back while throwing'],
    phases: [
      { label: 'Dip', pose: { torso: 14, leadKnee: -32, rearKnee: -28, leadHip: 30, rearHip: -14, leadShoulder: 25, leadElbow: 120 }, ms: 200 },
      { label: 'Drive up', pose: { torso: 2, leadShoulder: 60, leadElbow: 110, x: 2 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai uppercut technique',
  },
  {
    id: 'rear-uppercut',
    name: 'Rear Uppercut',
    code: '6',
    call: 'Rear uppercut',
    category: 'punches',
    level: 'beginner',
    strike: true,
    summary: 'A rising punch with the rear hand, powered by the rear hip — great after a lead hook.',
    cues: ['Dip slightly to the rear side', 'Turn the rear hip up and through', 'Lead hand protects the face'],
    mistakes: ['Telegraphing by dropping the hand', 'Standing too far away'],
    phases: [
      { label: 'Dip', pose: { torso: 14, leadKnee: -28, rearKnee: -32, leadHip: 26, rearHip: -16, rearShoulder: 15, rearElbow: 125 }, ms: 200 },
      { label: 'Drive up', pose: { torso: 6, rearShoulder: 62, rearElbow: 108, x: 5, rearHip: -14 }, ms: 170 },
      RETURN,
    ],
    videoQuery: 'muay thai rear uppercut',
  },

  // ---------- Kicks ----------
  {
    id: 'teep',
    name: 'Teep (Push Kick)',
    call: 'Teep',
    category: 'kicks',
    level: 'beginner',
    strike: true,
    summary: 'A straight push kick with the lead leg. Used to keep distance and break the opponent\'s rhythm.',
    cues: [
      'Lift the knee high first (chamber)',
      'Push the hips forward and strike with the ball of the foot',
      'Lean back slightly for balance',
      'Bring the knee back to chamber before putting the foot down',
    ],
    mistakes: ['Swinging the leg up straight instead of chambering', 'Pushing with the toes', 'Dropping the hands'],
    phases: [
      { label: 'Chamber the knee', pose: { leadHip: 92, leadKnee: -105, torso: -4 }, ms: 220 },
      { label: 'Push the hips through', pose: { leadHip: 90, leadKnee: -4, torso: -20, x: 6 }, ms: 170 },
      { label: 'Re-chamber', pose: { leadHip: 88, leadKnee: -105, torso: -4 }, ms: 200 },
      RETURN,
    ],
    videoQuery: 'muay thai teep push kick tutorial',
  },
  {
    id: 'rear-kick',
    name: 'Rear Roundhouse (Body)',
    call: 'Kick',
    category: 'kicks',
    level: 'beginner',
    strike: true,
    summary: 'The signature Muay Thai kick: a rotating swing of the rear shin into the body.',
    cues: [
      'Step out slightly with the lead foot and pivot on the ball of it',
      'Swing the leg like a bat — the hip turns over, the leg stays mostly straight',
      'Strike with the shin, not the foot',
      'Swing the kicking-side arm down and back for counterbalance',
      'Kick through the target, then return to stance',
    ],
    mistakes: ['Not pivoting the support foot', 'Snapping from the knee like a karate kick', 'Keeping the hips square'],
    phases: [
      { label: 'Step out & pivot', pose: { x: 4, torso: -5, rearHip: 5, rearKnee: -25 }, ms: 160 },
      { label: 'Turn the hip over', pose: { rearHip: 55, rearKnee: -55, torso: -20, rearShoulder: -10, rearElbow: 40 }, ms: 140 },
      { label: 'Swing through (shin)', pose: { rearHip: 85, rearKnee: -6, torso: -34, rearShoulder: -40, rearElbow: 20, leadShoulder: 60, leadElbow: 110, x: 4 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai roundhouse kick tutorial for beginners',
  },
  {
    id: 'head-kick',
    name: 'Rear Roundhouse (Head)',
    call: 'Head kick',
    category: 'kicks',
    level: 'intermediate',
    strike: true,
    summary: 'The same roundhouse mechanics aimed high — needs more hip turn and lean back.',
    cues: ['Same pivot as the body kick, more of it', 'Lean back further to lift the leg', 'Keep the lead hand near your face'],
    mistakes: ['Losing balance from not pivoting enough', 'Throwing it without a set-up'],
    phases: [
      { label: 'Step out & pivot', pose: { x: 4, torso: -8, rearHip: 10, rearKnee: -30 }, ms: 170 },
      { label: 'Turn the hip over', pose: { rearHip: 85, rearKnee: -60, torso: -30, rearShoulder: -15, rearElbow: 40 }, ms: 150 },
      { label: 'Swing high', pose: { rearHip: 125, rearKnee: -8, torso: -50, rearShoulder: -50, rearElbow: 15, leadShoulder: 75, leadElbow: 115, x: 2 }, ms: 170 },
      RETURN,
    ],
    videoQuery: 'muay thai head kick technique',
  },
  {
    id: 'low-kick',
    name: 'Low Kick',
    call: 'Low kick',
    category: 'kicks',
    level: 'beginner',
    strike: true,
    summary: 'A roundhouse kick to the opponent\'s thigh. Slightly downward angle, shin into the meat of the leg.',
    cues: ['Pivot and turn the hip as for the body kick', 'Kick slightly downward through the thigh', 'Keep your guard high — low kicks invite counters'],
    mistakes: ['Kicking the knee', 'Hitting with the foot'],
    phases: [
      { label: 'Step out & pivot', pose: { x: 4, torso: -4, rearHip: 0, rearKnee: -20 }, ms: 150 },
      { label: 'Chop through', pose: { rearHip: 50, rearKnee: -6, torso: -20, rearShoulder: -25, rearElbow: 30, x: 4 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai low kick tutorial',
  },
  {
    id: 'switch-kick',
    name: 'Switch Kick (Lead Roundhouse)',
    call: 'Switch kick',
    category: 'kicks',
    level: 'intermediate',
    strike: true,
    summary: 'Switch your feet, then throw a roundhouse with the (now rear) lead leg.',
    cues: ['Fast, small switch step', 'Kick immediately off the switch', 'Same hip turn as a rear kick'],
    mistakes: ['A slow, obvious switch', 'Not turning the hip over'],
    phases: [
      { label: 'Switch feet', pose: { leadHip: -20, rearHip: 18, x: -3 }, ms: 200 },
      { label: 'Turn the hip over', pose: { leadHip: 60, leadKnee: -55, rearHip: 10, torso: -22, leadShoulder: -10, leadElbow: 40 }, ms: 140 },
      { label: 'Swing through', pose: { leadHip: 86, leadKnee: -6, rearHip: 8, torso: -34, leadShoulder: -35, leadElbow: 20, rearShoulder: 55, rearElbow: 120 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai switch kick tutorial',
  },

  // ---------- Knees ----------
  {
    id: 'knee',
    name: 'Straight Knee',
    call: 'Knee',
    category: 'knees',
    level: 'beginner',
    strike: true,
    summary: 'Drive the rear knee straight up and forward into the body, pushing the hips through.',
    cues: ['Rise onto the ball of the support foot', 'Push the hips forward — the knee is the tip of the spear', 'Point the toes down', 'Hands reach forward as if pulling the opponent in'],
    mistakes: ['Lifting the knee without hip drive', 'Leaning back too far'],
    phases: [
      { label: 'Chamber', pose: { rearHip: 55, rearKnee: -120, torso: -4 }, ms: 190 },
      { label: 'Hips through', pose: { rearHip: 100, rearKnee: -150, torso: -16, x: 7, leadShoulder: 105, leadElbow: 40, rearShoulder: 100, rearElbow: 40 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai straight knee technique',
  },
  {
    id: 'diagonal-knee',
    name: 'Diagonal Knee',
    call: 'Diagonal knee',
    category: 'knees',
    level: 'intermediate',
    strike: true,
    summary: 'A knee that travels in from the side at an angle, turning the hip over like a kick.',
    cues: ['Turn the hip over as the knee rises', 'Lean the upper body back and away', 'Target the ribs'],
    mistakes: ['No hip rotation', 'Dropping the guard'],
    phases: [
      { label: 'Chamber', pose: { rearHip: 45, rearKnee: -110, torso: -6 }, ms: 180 },
      { label: 'Turn in', pose: { rearHip: 85, rearKnee: -140, torso: -26, x: 5, rearShoulder: 0, rearElbow: 60 }, ms: 170 },
      RETURN,
    ],
    videoQuery: 'muay thai diagonal knee',
  },

  // ---------- Elbows ----------
  {
    id: 'elbow',
    name: 'Horizontal Elbow',
    call: 'Elbow',
    category: 'elbows',
    level: 'beginner',
    strike: true,
    summary: 'A short, flat elbow with the rear arm across the target, powered by hip rotation like a cross.',
    cues: ['Lift the elbow to shoulder height, hand near your own ear', 'Rotate the hip and slice across with the forearm tip', 'Other hand covers your face'],
    mistakes: ['Throwing from too far away', 'Opening the arm instead of keeping it folded'],
    phases: [
      { label: 'Raise & fold', pose: { rearShoulder: 70, rearElbow: 145, torso: 8 }, ms: 150 },
      { label: 'Slice across', pose: { rearShoulder: 96, rearElbow: 150, torso: 18, x: 7, rearHip: -14 }, ms: 150 },
      RETURN,
    ],
    videoQuery: 'muay thai horizontal elbow technique',
  },
  {
    id: 'up-elbow',
    name: 'Uppercut Elbow',
    call: 'Up elbow',
    category: 'elbows',
    level: 'intermediate',
    strike: true,
    summary: 'An elbow that rises vertically through the chin or between the opponent\'s guard.',
    cues: ['Drive up from the legs', 'Elbow travels straight up the centre line', 'Keep the fist close to your ear'],
    mistakes: ['Swinging outward instead of straight up'],
    phases: [
      { label: 'Dip', pose: { torso: 12, leadKnee: -28, rearKnee: -28, leadHip: 28, rearHip: -14 }, ms: 180 },
      { label: 'Drive up', pose: { torso: 2, rearShoulder: 150, rearElbow: 160, x: 4 }, ms: 160 },
      RETURN,
    ],
    videoQuery: 'muay thai uppercut elbow',
  },
  {
    id: 'spin-elbow',
    name: 'Spinning Elbow',
    call: 'Spinning elbow',
    category: 'elbows',
    level: 'intermediate',
    strike: true,
    summary: 'Step across, spin on the lead foot and whip the rear elbow around. Powerful but risky — drill slowly.',
    cues: ['Step the lead foot across', 'Look over your rear shoulder first — eyes lead the spin', 'Whip the elbow at head height', 'Finish back in stance'],
    mistakes: ['Spinning blind without turning the head first', 'Spinning from too far away'],
    phases: [
      { label: 'Step across', pose: { leadHip: 5, x: 6 }, ms: 200 },
      { label: 'Turn (look over shoulder)', pose: { facing: -1, rearShoulder: 80, rearElbow: 150, x: 8 }, ms: 260 },
      { label: 'Whip the elbow', pose: { facing: 1, rearShoulder: 95, rearElbow: 150, torso: 16, x: 8 }, ms: 220 },
      RETURN,
    ],
    videoQuery: 'muay thai spinning elbow tutorial',
  },

  // ---------- Defense ----------
  {
    id: 'check',
    name: 'Check (Shin Block)',
    call: 'Check',
    category: 'defense',
    level: 'beginner',
    strike: true,
    summary: 'Lift the lead shin to block an incoming kick with your shin bone.',
    cues: ['Lift the knee out and up toward the same-side elbow', 'Turn the shin out to meet the kick', 'Hands stay high', 'Plant it straight back down'],
    mistakes: ['Lifting the leg straight forward', 'Leaning back off balance', 'Dropping the hands'],
    phases: [
      { label: 'Lift shin', pose: { leadHip: 70, leadKnee: -110, torso: 2, leadShoulder: 50, leadElbow: 125 }, ms: 160 },
      { label: 'Hold', pose: { leadHip: 70, leadKnee: -110, torso: 2, leadShoulder: 50, leadElbow: 125 }, ms: 260 },
      RETURN,
    ],
    videoQuery: 'muay thai how to check a kick',
  },
  {
    id: 'parry',
    name: 'Parry',
    call: 'Parry',
    category: 'defense',
    level: 'beginner',
    strike: true,
    summary: 'Redirect a straight punch with a small slap of the hand rather than taking it on the guard.',
    cues: ['Small movement — just enough to redirect', 'Use the opposite hand (rear parries jab)', 'Return to guard instantly'],
    mistakes: ['Reaching out to meet the punch', 'Big swatting movement'],
    phases: [
      { label: 'Tap across', pose: { rearShoulder: 55, rearElbow: 100 }, ms: 140 },
      RETURN,
    ],
    videoQuery: 'muay thai parry technique',
  },
  {
    id: 'block',
    name: 'High Block',
    call: 'Block',
    category: 'defense',
    level: 'beginner',
    strike: true,
    summary: 'Cover up against hooks and high kicks by bringing the forearm and glove tight to the head.',
    cues: ['Elbow up, glove against the side of your head', 'Tuck the chin', 'Brace — don\'t flinch backward'],
    mistakes: ['Blocking with the glove away from the head', 'Closing the eyes'],
    phases: [
      { label: 'Cover', pose: { leadShoulder: 70, leadElbow: 150, rearShoulder: 60, rearElbow: 155, torso: 12 }, ms: 150 },
      { label: 'Hold', pose: { leadShoulder: 70, leadElbow: 150, rearShoulder: 60, rearElbow: 155, torso: 12 }, ms: 300 },
      RETURN,
    ],
    videoQuery: 'muay thai high block defense',
  },
  {
    id: 'lean-back',
    name: 'Lean Back',
    call: 'Lean back',
    category: 'defense',
    level: 'intermediate',
    strike: true,
    summary: 'Sway the upper body back over the rear leg to make a punch or kick miss by inches.',
    cues: ['Weight shifts onto the rear leg', 'Lean back from the waist, chin tucked', 'Hands stay up', 'Come back ready to counter'],
    mistakes: ['Leaning back without shifting weight', 'Lifting the chin'],
    phases: [
      { label: 'Sway back', pose: { torso: -28, x: -6, rearKnee: -24, rearHip: -16 }, ms: 220 },
      RETURN,
    ],
    videoQuery: 'muay thai lean back defense',
  },

  // ---------- Clinch ----------
  {
    id: 'clinch',
    name: 'Plum Clinch & Knee',
    call: 'Clinch knee',
    category: 'clinch',
    level: 'intermediate',
    strike: true,
    summary: 'Clasp both hands behind the opponent\'s head, pull the head down and drive knees up.',
    cues: ['Hands on top of each other behind the head — never interlace fingers', 'Forearms squeeze the neck, elbows together', 'Pull down as the knee drives up', 'Stay tall and keep your hips close'],
    mistakes: ['Interlacing the fingers', 'Elbows flared wide', 'Bending over with the opponent'],
    phases: [
      { label: 'Reach & clasp', pose: { leadShoulder: 130, leadElbow: 70, rearShoulder: 125, rearElbow: 75, torso: 8 }, ms: 260 },
      { label: 'Pull down', pose: { leadShoulder: 105, leadElbow: 50, rearShoulder: 100, rearElbow: 55, torso: 4 }, ms: 200 },
      { label: 'Knee', pose: { leadShoulder: 100, leadElbow: 50, rearShoulder: 95, rearElbow: 55, rearHip: 100, rearKnee: -150, torso: -12, x: 5 }, ms: 180 },
      RETURN,
    ],
    videoQuery: 'muay thai plum clinch knees tutorial',
  },
];

export const TECH_BY_ID: Record<string, Technique> = Object.fromEntries(TECHNIQUES.map((t) => [t.id, t]));

export const STRIKES = TECHNIQUES.filter((t) => t.strike);

export const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

/** Extract a YouTube video id from common URL forms; null if not a YouTube link. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([^/?]+)/);
      if (m) return m[2];
    }
  } catch {
    /* not a URL */
  }
  return null;
}
