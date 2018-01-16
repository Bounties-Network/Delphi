/* eslint-env mocha */
/* global contract artifacts assert web3 */

const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');

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

      const balance = await web3.eth.getBalance(ds.address);
      assert.strictEqual(balance.toString(10), stake.toString(10), 'the contract\'s balance and stake did not match');
    });

    it('should revert when _value does not equal msg.value', async () => {
      try {
        await DelphiStake.new(conf.initialStake, conf.stakeTokenAddr, conf.data,
          conf.lockupPeriod, conf.arbiter, { from: accounts[0], value: 1 });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
      }
    });
  });
});
