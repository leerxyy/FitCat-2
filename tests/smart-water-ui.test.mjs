import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDOM, tick, activeProFixture } from './dom.mjs';

test('redesigned smart water keeps saved conditions, accurate contributions and the diary amount', async t => {
  const env=setupDOM({...activeProFixture(),fitnessProfile:JSON.stringify({name:'Тест',age:20,gender:'male',height:170,weight:52,goal:'maintain'}),lastDate:new Date().toDateString(),smartWaterEnabled:'true',currentTemp:'27',currentSteps:'12800',waterAmount:'750'});
  const $=id=>document.getElementById(id);
  const input=async(id,value,type='input')=>{if(type==='change')$(id).checked=value;else $(id).value=value;$(id).dispatchEvent(new Event(type,{bubbles:true}));await tick();};
  const click=async(selector)=>{const element=document.querySelector(selector);assert.ok(element,selector);element.click();await tick();};
  try {
    await import('../js/app.js');
    const {state,loadState}=await import('../js/core/store.js');
    const {renderPreferences}=await import('../js/features/preferences.js');
    await t.test('opening uses the existing settings and the same totals as the approved mockup',async()=>{
      await click('[data-action="openSmartWater"]');
      assert.equal($('smartWaterModal').open,true);assert.equal(document.activeElement,$('smartWaterTitle'));
      assert.equal($('smartWaterGoal').textContent,'2,37');assert.match($('totalWaterNorm').textContent,/2.?370/);
      assert.match($('baseWaterNorm').textContent,/1.?820/);assert.equal($('tempBonus').textContent,'+300 мл');assert.equal($('stepsBonus').textContent,'+250 мл');
      assert.equal($('tempDisplay').textContent,'27°C');assert.match($('stepsDisplay').textContent,/12.?800/);
      assert.equal($('tempSlider').style.getPropertyValue('--range-fill'),'74%');assert.equal($('stepsSlider').style.getPropertyValue('--range-fill'),'64%');
      assert.equal($('smartWaterSettings').hidden,false);assert.equal($('smartWaterWorkoutRow').hidden,true);
    });
    await t.test('range changes update the hero, contribution chips, main target and durable settings',async()=>{
      await input('tempSlider',40);await input('stepsSlider',20000);
      assert.equal($('smartWaterGoal').textContent,'2,62');assert.equal($('tempBonusChip').textContent,'+500 мл');assert.equal($('stepsBonusChip').textContent,'+300 мл');
      assert.equal($('tempSlider').style.getPropertyValue('--range-fill'),'100%');assert.equal($('stepsSlider').style.getPropertyValue('--range-fill'),'100%');
      assert.equal(env.localStorage.getItem('currentTemp'),'40');assert.equal(env.localStorage.getItem('currentSteps'),'20000');
      assert.equal($('waterGoal').textContent,'2,62 л');assert.equal(state.water,750);assert.equal(env.localStorage.getItem('waterAmount'),'750');
    });
    await t.test('an active training contribution is visible and counted exactly once',async()=>{
      await input('workoutToggle',true,'change');await click('[data-action="selectWorkoutIntensity"][data-value="moderate"]');
      assert.equal($('smartWaterWorkoutRow').hidden,false);assert.equal($('smartWaterWorkoutBonus').textContent,'+250 мл');
      assert.equal($('smartWaterGoal').textContent,'2,87');assert.match($('totalWaterNorm').textContent,/2.?870/);
      assert.equal($('smartWaterExtraAmount').textContent,'+1\u00a0050 мл');
    });
    await t.test('turning conditions off preserves both sliders and the independent training adjustment',async()=>{
      await input('smartWaterToggle',false,'change');
      assert.equal($('smartWaterSettings').hidden,true);assert.equal($('waterBaseOnly').hidden,false);
      assert.equal($('smartWaterTempRow').hidden,true);assert.equal($('smartWaterStepsRow').hidden,true);
      assert.equal($('smartWaterWorkoutRow').hidden,false);assert.equal($('smartWaterGoal').textContent,'2,07');
      assert.equal(state.preferences.currentTemp,40);assert.equal(state.preferences.currentSteps,20000);
      await click('#smartWaterModal [data-sheet-handle]');assert.equal($('smartWaterModal').open,false);
      loadState(env.localStorage);renderPreferences();await click('[data-action="openSmartWater"]');await input('smartWaterToggle',true,'change');
      assert.equal($('smartWaterGoal').textContent,'2,87');assert.equal($('tempSlider').value,'40');assert.equal($('stepsSlider').value,'20000');
    });
    await t.test('the lower range boundaries return to the base goal without residual additions',async()=>{
      await input('workoutToggle',false,'change');await input('tempSlider',-10);await input('stepsSlider',0);
      assert.equal($('smartWaterGoal').textContent,'1,82');assert.equal($('smartWaterExtraLine').hidden,true);assert.equal($('smartWaterBaseLabel').hidden,false);
      assert.equal($('tempBonus').textContent,'+0 мл');assert.equal($('stepsBonus').textContent,'+0 мл');assert.equal($('smartWaterWorkoutRow').hidden,true);
      assert.equal($('tempSlider').style.getPropertyValue('--range-fill'),'0%');assert.equal($('stepsSlider').style.getPropertyValue('--range-fill'),'0%');
    });
    await t.test('new controls remain labelled and translated in English and Chinese',async()=>{
      state.preferences.lang='en';document.dispatchEvent(new Event('fitcat:language'));await tick();
      assert.equal(document.querySelector('label[for="tempSlider"]').textContent,'Air temperature');assert.equal(document.querySelector('label[for="stepsSlider"]').textContent,'Steps today');
      assert.equal($('smartWaterGoal').textContent,'1.82');assert.equal($('tempSlider').getAttribute('aria-valuetext'),'-10°C');
      state.preferences.lang='cn';document.dispatchEvent(new Event('fitcat:language'));await tick();
      assert.equal(document.querySelector('label[for="tempSlider"]').textContent,'气温');assert.match($('totalWaterNorm').textContent,/毫升/);
      assert.equal(state.water,750);
    });
  } finally {env.restoreTimers();}
});
