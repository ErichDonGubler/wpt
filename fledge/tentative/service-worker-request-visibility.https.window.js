// META: script=/resources/testdriver.js
// META: script=/common/utils.js
// META: script=resources/fledge-util.sub.js
// META: script=/common/subset-tests.js
// META: timeout=long
// META: variant=?1-last
"use strict;"

// In order to validate a service worker, it's scriptURL should
// be the one we registered in registerServiceWorker().
function validateServiceWorker() {
    if (navigator.serviceWorker.controller) {
        return navigator.serviceWorker.controller.scriptURL.includes('service-worker-helper.js');
    }
    return false
}

// Prepares the test environment by ensuring a valid service worker
// registration. Reloads the page if no service worker is found or
// if it's not registered correctly.
async function checkServiceWorkersAndReload() {
    let count = (await navigator.serviceWorker.getRegistrations()).length;
    if (count === 0 || !validateServiceWorker()) {
        window.location.reload();
    }
}
// Registers a service worker to the current scope.
async function registerServiceWorker() {
    try {
        await navigator.serviceWorker.register('./service-worker-helper.js');
        await navigator.serviceWorker.ready;
    } catch (error) {
        throw (Error, "Error while registering service worker: " + error);
    }
}

// Tests that private requests are not seen by the service worker.
// Specificlly anything that contains:
// - 'resources/trusted-bidding-signals.py'
// - 'update-url.py'
// - 'bidding-wasmlogic.wasm'
// - 'bidding-logic.py'
// - 'decision-logic.py'

// This test works by having the service worker send a message
// over the broadcastChannel, if it sees a request that contains
// any of the following strings above, it will send a 'failed'
// result which will cause assert_false case to fail.
subsetTest(promise_test, async test => {
    await checkServiceWorkersAndReload();
    const uuid = generateUuid(test);
    const broadcastChannel = new BroadcastChannel('private-requests-test');
    broadcastChannel.addEventListener('message', (event) => {
        assert_false(event.data.result === 'failed',
        /*errorMessage=*/event.data.message);
    });
    await registerServiceWorker();
    await joinInterestGroup(test, uuid);
    await runBasicFledgeAuctionAndNavigate(test, uuid);
    // By verifying that these requests are observed we can assume
    // none of the other requests were seen by the service-worker.
    await waitForObservedRequests(
        uuid,
        [createBidderReportURL(uuid), createSellerReportURL(uuid)]);
}, "Make sure service workers do not see private requests");

// Tests that public requests are seen by the service worker.
// Specificlly anything that contains:
// - 'direct-from-seller-signals.py'

// This test works by having the service worker send a message over
// the broadcastChannel, if it sees a request that contains any of
// the following strings above, it will send a 'passed' result and
// also change the variable 'finish_test', to true, so that guarantees
// that the request was seen before we complete the test.
subsetTest(promise_test, async test => {
    checkServiceWorkersAndReload();
    const broadcastChannel = new BroadcastChannel('public-requests-test');
    let finish_test = false;
    broadcastChannel.addEventListener('message', (event) => {
        assert_true(event.data.result === 'passed');
        finish_test = true;
    });

    await registerServiceWorker();

    while (!finish_test) {
        await fetchDirectFromSellerSignals({ 'Buyer-Origin': window.location.origin });
    }
}, "Make sure service workers do see public requests.");
