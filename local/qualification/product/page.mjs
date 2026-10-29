/** Locators and user actions only. Assertions stay in the installed scenario. */
export class InstalledFleetPage {
  constructor(page) {
    this.page = page;
  }
  readings() {
    return this.page.getByRole('region', { name: 'Property readings', exact: true });
  }
  delivery() {
    return this.page.getByRole('region', {
      name: 'Live property delivery',
      exact: true,
    });
  }
  async signIn() {
    await this.page.goto('https://fleet.test:8443/assets');
    await this.page.getByRole('link', { name: 'Sign in', exact: true }).click();
    for (let i = 0; i < 2; i++) {
      await this.page
        .getByRole('button', { name: 'Continue as test operator', exact: true })
        .click();
    }
    await this.page.waitForURL('https://fleet.test:8443/**');
  }
  async inspector(asset = 'asset-main') {
    const now = Date.now();
    await this.page.goto(
      `https://fleet.test:8443/assets/${asset}?tenant=tenant-a&property=position.latitude&property_version=1&effective_at_ms=${now}&known_at_ms=${now}&history_start=${now - 3600000}&history_end=${now + 60000}`,
    );
    await this.page
      .getByLabel('Property and definition version')
      .selectOption(JSON.stringify(['position.latitude', 1]));
  }
  async startLive() {
    await this.delivery()
      .getByRole('button', { name: 'Start live updates', exact: true })
      .click();
  }
  async retryStoppedDelivery() {
    const retry = this.delivery().getByRole('button', {
      name: 'Retry live updates',
      exact: true,
    });
    if (!(await retry.isVisible())) return false;
    const problem = await this.delivery().getByRole('alert').textContent();
    if (!problem?.includes('The service is unavailable')) return false;
    await retry.click();
    return true;
  }
  async map() {
    await this.page.goto(
      'https://fleet.test:8443/map?tenant=tenant-a&latitude_property=position.latitude&latitude_version=1&longitude_property=position.longitude&longitude_version=1&encoding=e7',
    );
  }
  async leaveMap() {
    await this.page.goto('https://fleet.test:8443/assets?tenant=tenant-a');
  }
}
