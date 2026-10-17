import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, submit, tick } from './dom.mjs';

test('first visit creates a profile and opens the diary without demo data', async () => {
  const env = setupDOM();
  try {
    await import('../js/app.js'); const { state } = await import('../js/core/store.js');
    const $ = id => document.getElementById(id);
    assert.equal($('setupPage').hidden, false); assert.equal($('bottomNav').hidden, true);
    submit($('setupForm')); await tick(); assert.equal(state.profile, null);
    for (const [id, value] of Object.entries({ setupName: 'Анна', setupAge: 22, setupHeight: 170, setupWeight: 65 })) $(id).value = value;
    submit($('setupForm')); await tick();
    assert.equal(state.profile.name, 'Анна'); assert.equal(state.profile.gender, 'female');
    assert.equal($('mainPage').hidden, false); assert.equal($('bottomNav').hidden, false);
    assert.equal(state.foods.length, 0); assert.equal(state.water, 0); assert.equal($('caloriesEaten').dataset.value, '0');
    assert.equal(JSON.parse(env.localStorage.getItem('fitnessProfile')).name, 'Анна');
  } finally { env.restoreTimers(); }
});
