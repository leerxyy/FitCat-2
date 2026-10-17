import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setupDOM, submit, tick } from './dom.mjs';
import { loadState, state } from '../js/core/store.js';
import { initActions } from '../js/ui/components.js';
import { initWallet, getWallet } from '../js/features/wallet.js';
import { initSubscription } from '../js/features/subscription.js';
import { WALLET_KEY } from '../js/core/wallet.js';

test('wallet promo, receipt filters, coin checkout, PRO+ reveal and honest transfer form are wired', async () => {
  const env = setupDOM(); const $ = id => document.getElementById(id);
  const fixture = 'TEST-0123-COIN-AA-1B';
  const click = async selector => { const button = document.querySelector(selector); assert.ok(button,selector); button.click(); await tick(); };
  const settle = () => new Promise(resolve => setTimeout(resolve,30));
  try {
    loadState(env.localStorage); initActions(); initWallet({promoHash:createHash('sha256').update(fixture).digest('hex')}); initSubscription();
    await click('#subscriptionBadge'); await click('#subscriptionPurchase');
    assert.equal($('subscriptionPurchaseError').hidden,false); assert.equal($('subscriptionWalletAction').hidden,false);
    await click('#subscriptionWalletAction');
    assert.equal($('subscriptionDialog').open,false); assert.equal($('walletDialog').open,true);
    assert.equal(document.querySelector('[data-wallet-panel="promo"]').hidden,false);
    $('walletPromoCode').value = fixture.toLowerCase(); submit($('walletPromoForm')); await settle();
    assert.equal(getWallet().snapshot().balance,99999); assert.equal(document.querySelector('[data-wallet-panel="success"]').hidden,false);
    assert.equal($('walletPromoCode').value,''); assert.match($('walletSuccessAmount').textContent,/99.?999/);
    await click('[data-action="walletOverview"]'); assert.match($('walletHistoryList').textContent,/Поступление/);
    await click('[data-wallet-filter="out"]'); assert.match($('walletHistoryList').textContent,/пока нет/);
    await click('[data-wallet-filter="all"]');
    await click('[data-action="walletTransfer"]'); const rawBefore = env.localStorage.getItem(WALLET_KEY);
    $('walletRecipient').value='81234567890'; $('walletTransferAmount').value='250'; submit($('walletTransferForm')); await tick();
    assert.match($('walletTransferResult').textContent,/пока недоступны/); assert.equal(env.localStorage.getItem(WALLET_KEY),rawBefore);
    await click('[data-wallet-panel="transfer"] [data-close="walletDialog"]');
    await click('#subscriptionBadge'); await click('#subscriptionPurchase');
    assert.equal(document.querySelector('[data-subscription-panel="checkout"]').hidden,false);
    assert.match($('checkoutPrice').textContent,/29/); assert.match($('checkoutAfter').textContent,/99.?970/);
    await click('#confirmSubscriptionPurchase');
    assert.equal(getWallet().snapshot().balance,99970); assert.equal(getWallet().snapshot().entries.length,2);
    assert.equal(document.querySelector('[data-subscription-panel="success"]').hidden,false);
    assert.equal($('subscriptionBadge').classList.contains('is-pro'),false);
    await click('[data-subscription-panel="success"] [data-close="subscriptionDialog"]');
    assert.equal($('subscriptionBadge').classList.contains('is-pro'),true);
    await click('#walletBadge'); await click('[data-wallet-filter="out"]');
    assert.match($('walletHistoryList').textContent,/PRO\+/); assert.match($('walletHistoryList').textContent,/Списание/);
    assert.equal($('walletHistoryList').textContent.includes('99 999'),false);
    state.preferences.lang='en'; document.dispatchEvent(new Event('fitcat:language')); await tick();
    assert.match($('walletHistoryList').textContent,/Outgoing/);
  } finally { env.restoreTimers(); }
});
