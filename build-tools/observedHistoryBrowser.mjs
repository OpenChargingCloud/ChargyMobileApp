// Only between independent fixture worlds that intentionally reuse the same RN/revision.
// Persistence/rollback tests must NOT call this between their related packets.
// beforeReset lets the real-browser regression commit genuine peer evidence after
// selecting a scope, without changing storage, signatures or verification results.
export async function resetObservedPOIHistory(page,beforeReset){
    if(!await page.locator('#settingsPage:visible').count())await page.locator('#settingsButton').click();
    while(await page.locator('#settingsTrustManagement').isVisible())await page.locator('#settingsBackButton').click();
    await page.locator('#settingsTrustManagementEntry').click();
    const management=page.locator('#settingsTrustManagement');
    await management.getByRole('button',{name:'Observed versions',exact:true}).click();
    await management.locator('.trustManagementList[aria-busy=false]').waitFor();
    while(await management.locator('[data-action=reset-observations]').count()){
        const id=await management.locator('[data-observation-id]').first().getAttribute('data-observation-id');
        const card=management.locator('[data-observation-id='+JSON.stringify(id)+']');
        await beforeReset?.();
        await card.locator('[data-action=reset-observations]').click();
        await card.locator('[data-action=confirm-reset-observations]').click();
        // Notifications may replace a card before reset starts. Wait for the
        // selected scope to be absent from a *completed* render, not an old node.
        await page.waitForFunction(id=>{
            const root=document.querySelector('#settingsTrustManagement');
            return root!==null&&root.querySelector('.trustManagementList[aria-busy=false]')!==null&&
                ![...root.querySelectorAll('[data-observation-id]')].some(card=>card.dataset.observationId===id);
        },id);
    }
    await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();await page.locator('#settingsBackButton').click();
}
