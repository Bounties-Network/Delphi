/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStakeFactory = artifacts.require('DelphiStakeFactory');
const DelphiStake = artifacts.require('DelphiStake');

contract('DelphiStakeFactory', () => {
  describe('Function: DelphiStakeFactory', () => {
    it('should set the master contract correctly', async () => {
      const ds = await DelphiStake.new();
      const df = await DelphiStakeFactory.new(ds.address);

      assert.strictEqual(await df.masterCopy.call(), ds.address, 'The master contract did not load properly');
    });
  });
});
