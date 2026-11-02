/** Follow the same session-card navigation as a Cordova user after an import. */
export async function openMobileSession(page) {
    await page.waitForFunction(() =>
        document.querySelector('#chargingSessionsPage')?.style.display === 'block' ||
        document.querySelector('#liveLinkPage')?.style.display === 'block');
    const cards = page.locator('#chargingSessionsPage:visible .chargingSession');
    if (await cards.count()) await cards.first().click();
}

/** Exercise the real Cordova back handler, including its duplicate-event guard. */
export async function mobileBack(page) {
    await page.clock.setFixedTime(new Date((await page.evaluate(() => Date.now())) + 350));
    await page.evaluate(() => document.dispatchEvent(new Event('backbutton')));
}
