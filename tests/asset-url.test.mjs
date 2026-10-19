import test from 'node:test';
import assert from 'node:assert/strict';
import { appAssetURL, cssAssetURL } from '../js/core/asset-url.js';
import { COLLECTIBLE_PROFILE_FRAMES } from '../js/core/profile-frames.js';
import { CITY_PROFILE_COVERS } from '../js/core/profile-cities.js';
import { existsSync } from 'node:fs';

test('CSS image URLs remain under the GitHub Pages application root from any consuming stylesheet',()=>{
  const moduleURL='https://leerxyy.github.io/FitCat-2/js/core/asset-url.js';
  for(const frame of COLLECTIBLE_PROFILE_FRAMES)for(const suffix of ['','-thumb','-light','-aura']){
    const path=`assets/profile-frames/${frame}${suffix}.webp`,url=appAssetURL(path,moduleURL);
    assert.equal(url,'https://leerxyy.github.io/FitCat-2/'+path);
    for(const sheet of ['styles/profile-collectibles.css','styles/nested/material.css'])assert.equal(new URL(url,'https://leerxyy.github.io/FitCat-2/'+sheet).href,url);
  }
  // This is the former bug: a relative custom-property value consumes the
  // stylesheet's base URL and incorrectly requests styles/assets/....
  assert.equal(new URL('assets/profile-frames/dragon.webp','https://leerxyy.github.io/FitCat-2/styles/profile-collectibles.css').pathname,'/FitCat-2/styles/assets/profile-frames/dragon.webp');
});
test('assets work on root domains, nested app roots and file-based local packages',()=>{
  for(const [moduleURL,expected]of [['https://fitcat.example/js/core/asset-url.js','https://fitcat.example/assets/icons/coin.svg'],['https://example.test/apps/fitcat/js/core/asset-url.js','https://example.test/apps/fitcat/assets/icons/coin.svg'],['http://localhost:3000/js/core/asset-url.js','http://localhost:3000/assets/icons/coin.svg']])assert.equal(appAssetURL('assets/icons/coin.svg',moduleURL),expected);
  for(const frame of COLLECTIBLE_PROFILE_FRAMES){const url=appAssetURL(`assets/profile-frames/${frame}.webp`);assert.ok(existsSync(new URL(url)));assert.equal(JSON.parse(cssAssetURL(`assets/profile-frames/${frame}.webp`).slice(4,-1)),url);}
  for(const city of CITY_PROFILE_COVERS)assert.ok(existsSync(new URL(appAssetURL(`assets/profile-effects/city-${city}-light-a.webp`))));
});
test('the internal asset resolver rejects traversal, remote URLs and CSS injection',()=>{
  for(const path of ['../secret','assets/../secret','https://evil.test/x','javascript:alert(1)','assets/x");color:red;/*',null,undefined])assert.throws(()=>appAssetURL(path),/invalid_asset_path/);
});
