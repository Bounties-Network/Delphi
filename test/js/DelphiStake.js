/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');

const utils = require('./utils.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: DelphiStake', () => {
    const [, , arbiter] = accounts;
    it('should instantiate the contract with the expected values', async () => {
      const ds = await DelphiStake.deployed();

      const stake = await ds.stake.call();
      assert.strictEqual(stake.toString(10), conf.initialStake,
        'the stake was initialized improperly');

      const tokenAddress = await ds.tokenAddress.call();
      assert.strictEqual(tokenAddress, conf.stakeTokenAddr,
        'the stake token address was initialized improperly');

      const data = await ds.data.call();
      assert.strictEqual(data, conf.data, 'the stake data was initialized improperly');

      const lockupPeriod = await ds.lockupPeriod.call();
      assert.strictEqual(lockupPeriod.toString(10), conf.lockupPeriod,
        'the lockup period was initialized improperly');

      const storedArbiter = await ds.arbiter.call();
      assert.strictEqual(arbiter, storedArbiter, 'the arbiter was initialized improperly');

      // TODO: Check contract balance matches provided stake
    });

    it('should revert when _value does not equal msg.value');
  });
});

