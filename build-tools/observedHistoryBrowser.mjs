// Only between independent fixture worlds that intentionally reuse the same RN/revision.
// Persistence/rollback tests must NOT call this between their related packets.
export async function resetObservedPOIHistory(page){
    if(!await page.locator('#settingsPage:visible').count())await page.locator('#settingsButton').click();
    while(await page.locator('#settingsTrustManagement').isVisible())await page.locator('#settingsBackButton').click();
    await page.locator('#settingsTrustManagementEntry').click();
    const management=page.locator('#settingsTrustManagement');
    await management.getByRole('button',{name:'Observed versions',exact:true}).click();
    await management.locator('.trustManagementList[aria-busy=false]').waitFor();
    while(await management.locator('[data-action=reset-observations]').count()){
        const previous=await management.locator('[data-observation-id]').first().elementHandle();
        await management.locator('[data-action=reset-observations]').first().click();
        await management.locator('[data-action=confirm-reset-observations]').click();
        await page.waitForFunction(element=>!element.isConnected,previous);await previous.dispose();
        await management.locator('.trustManagementList[aria-busy=false]').waitFor();
    }
    await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();
}
