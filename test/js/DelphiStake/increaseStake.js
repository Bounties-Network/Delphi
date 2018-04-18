/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const conf = utils.getConfig();

const BN = require('bignumber.js');

contract('DelphiStake', (accounts) => {
  describe('Function: increaseStake', () => {
    const [staker, claimant, arbiter, dave] = accounts;

    it('should revert if called by any entity other than the staker', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const incAmount = '1';

      const initialStake = await ds.claimableStake.call();

      try {
        await ds.increaseStake(incAmount, { from: dave });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalStake = await ds.claimableStake.call();
        assert.strictEqual(initialStake.toString(10), finalStake.toString(10),
          'the stake mysteriously incremented');

        // TODO: check actual balances
        return;
      }

      assert(false, 'should not have allowed somebody other than the staker to increase the stake');
    });

    it('should revert if _value does not equal the tokens transferred', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const initialStake = await ds.claimableStake.call();

      try {
        await ds.increaseStake('1', { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalStake = await ds.claimableStake.call();
        assert.strictEqual(initialStake.toString(10), finalStake.toString(10),
          'the stake mysteriously incremented');

        const tokenBalance = await token.balanceOf(ds.address);

        assert.strictEqual('100', tokenBalance.toString(10),
          'did not properly deposit the expected number of tokens');
        return;
      }

      assert(false, 'should not have allowed the staker to increase the stake by an amount other ' +
        'than that they explicitly specified');
    });

    it('should increment the stake by _value', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.lockupPeriod, arbiter, { from: staker });

      const incAmount = '1';

      const initialStake = await ds.claimableStake.call();
      await token.approve(ds.address, incAmount, { from: staker });

      await ds.increaseStake(incAmount, { from: staker });

      const finalStake = await ds.claimableStake.call();
      assert.strictEqual(initialStake.add(new BN(incAmount, 10)).toString(10),
        finalStake.toString(10),
        'did not properly increment stake');

      const tokenBalance = await token.balanceOf(ds.address);
      assert.strictEqual('101', tokenBalance.toString(10),
        'did not properly deposit the expected number of tokens');
    });

    it('should emit a StakeIncreased event');
  });
});
