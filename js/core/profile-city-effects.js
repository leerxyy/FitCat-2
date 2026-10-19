// Geometry is authored for the approved 1536x1024 art, not guessed each frame.
// Build tools use the same regions as runtime lights and native SVG routes.
export const CITY_EFFECTS = Object.freeze({
  chongqing: Object.freeze({
    water: [[0,.37],[.13,.36],[.155,.46],[.22,.50],[.35,.535],[.53,.55],[.69,.56],[1,.595],[1,.79],[.93,.755],[.84,.735],[.78,.695],[.72,.745],[.63,.71],[.55,.72],[.46,.68],[.38,.66],[.30,.625],[.22,.58],[.16,.60],[.11,.545],[0,.53]],
    glass: [[[.835,.02],[.872,.02],[.875,.40],[.838,.40]],[[.45,.18],[.51,.18],[.51,.43],[.45,.43]],[[.65,.18],[.72,.18],[.72,.42],[.65,.42]]],
    routes: [],
    fog: [.8,.9,.62],
  }),
  moscow: Object.freeze({
    water: [[0,.834],[.20,.833],[.45,.819],[.62,.804],[.82,.775],[1,.753],[1,1],[0,1]],
    glass: [[[.555,.025],[.594,.025],[.653,.69],[.56,.69]],[[.648,.18],[.696,.18],[.75,.72],[.686,.72]],[[.77,.15],[.816,.15],[.858,.71],[.79,.71]]],
    routes: [{d:'M 90 936 C 300 913 540 908 792 902',type:'ferry'},{d:'M 1130 845 C 1210 831 1330 822 1460 821',type:'ferry'}],
    fog: [.13,0,0],
  }),
  dubai: Object.freeze({
    water: [[.45,.57],[.54,.54],[.59,.55],[.61,.61],[.69,.65],[.77,.68],[.83,.68],[.87,.74],[.99,.79],[1,.91],[.87,.88],[.80,.90],[.74,.86],[.67,.86],[.65,.78],[.58,.75],[.54,.68],[.48,.66]],
    glass: [[[.506,.01],[.521,.01],[.535,.49],[.493,.49]],[[.276,.41],[.291,.40],[.291,.65],[.259,.65]]],
    routes: [
      {d:'M 72 819 C 165 820 292 876 428 943',type:'road'},
      {d:'M 140 680 C 160 643 220 640 262 602 C 288 580 292 549 288 532',type:'road'},
      {d:'M 866 835 C 890 882 981 935 1130 1013',type:'road'},
      {d:'M 1175 858 C 1245 888 1280 923 1378 954',type:'road'},
      {d:'M 0 320 C 170 308 230 294 363 278',type:'road'},
      {d:'M 1300 286 C 1190 292 1100 305 1003 342',type:'road'},
    ],
    fog: [.22,0,.18],
  }),
  hongkong: Object.freeze({
    water: [[0,.335],[.16,.333],[.29,.347],[.37,.327],[.43,.335],[.49,.32],[.56,.296],[.62,.26],[.73,.26],[.85,.22],[1,.23],[1,.37],[.91,.36],[.88,.375],[.81,.37],[.78,.40],[.70,.40],[.68,.43],[.61,.45],[.53,.47],[.43,.45],[.37,.44],[.31,.41],[.22,.40],[.12,.39],[0,.40]],
    glass: [[[.352,.19],[.385,.19],[.402,.58],[.353,.58]],[[.70,.29],[.741,.29],[.758,.58],[.715,.58]]],
    routes: [{d:'M 1160 300 C 1240 285 1330 280 1458 285',type:'ferry'},{d:'M 790 412 C 843 396 905 386 965 378',type:'ferry'}],
    fog: [.58,.36,.18],
  }),
});
export const CITY_LAYER_SUFFIXES = Object.freeze(['light-a','light-b','glass','water-mask','water-a','water-b']);
export function cityEffectAssets(cover) {
  if (!Object.hasOwn(CITY_EFFECTS, cover)) return {};
  return Object.fromEntries(CITY_LAYER_SUFFIXES.map(suffix => [suffix, `assets/profile-effects/city-${cover}-${suffix}.webp`]));
}
export function cityTrafficMarkup(cover) {
  const routes = CITY_EFFECTS[cover]?.routes ?? [];
  return routes.map((route, index) => `<g class="city-route route-${route.type}" style="--route-cycle:${route.type === 'road' ? 6.4 + index * 1.15 : 24 + index * 9}s;--route-delay:${-index * 3.1}s"><path class="route-halo" d="${route.d}" pathLength="100"></path><path class="route-light" d="${route.d}" pathLength="100"></path></g>`).join('');
}
