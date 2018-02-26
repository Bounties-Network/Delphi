/* eslint-env mocha */
/* global contract artifacts assert  */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: DelphiStake', () => {
    const [staker, , arbiter] = accounts;
    it('should instantiate the contract with the expected values', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const stake = await ds.claimableStake.call();
      assert.strictEqual(stake.toString(10), conf.initialStake,
        'the stake was initialized improperly');

      const tokenAddress = await ds.token.call();
      assert.strictEqual(tokenAddress, token.address,
        'the stake token address was initialized improperly');

      const data = await ds.data.call();
      assert.strictEqual(data, conf.data, 'the stake data was initialized improperly');

      const lockupPeriod = await ds.lockupPeriod.call();
      assert.strictEqual(lockupPeriod.toString(10), conf.lockupPeriod,
        'the lockup period was initialized improperly');

      const lockupRemaining = await ds.lockupRemaining.call();
      assert.strictEqual(lockupRemaining.toString(10), conf.lockupPeriod,
        'the lockup remaining was initialized improperly');

      const storedArbiter = await ds.arbiter.call();
      assert.strictEqual(arbiter, storedArbiter, 'the arbiter was initialized improperly');

      const balance = await token.balanceOf(ds.address);
      assert.strictEqual(balance.toString(10), stake.toString(10), 'the contract\'s balance and stake did not match');
    });

    it('should revert when _value does not equal the amount of tokens sent', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, 10, { from: staker });


      try {
        await ds.initDelphiStake(conf.initialStake, token.address, conf.data,
          conf.lockupPeriod, arbiter, { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'did not revert after trying to init the stake with an incorrect amount of tokens');
    });
  });
});
