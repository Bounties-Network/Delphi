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
    const incAmount = '1';

    let ds;
    let token;
    let initialStake;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(staker, conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      // approve the staker and dave to spec incAmount to increase the stake
      await token.approve(ds.address, incAmount, { from: staker });
      await token.approve(ds.address, incAmount, { from: dave });

      initialStake = new BN(conf.initialStake, 10);
    });

    it('should revert if called by any entity other than the staker', async () => {
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
      try {
        await ds.increaseStake(incAmount + 1, { from: staker });
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
      await ds.increaseStake(incAmount, { from: staker });

      const finalStake = await ds.claimableStake.call();

      assert.strictEqual(initialStake.add(new BN(incAmount, 10)).toString(10),
        finalStake.toString(10),
        'did not properly increment stake');

      const tokenBalance = await token.balanceOf(ds.address);
      assert.strictEqual('101', tokenBalance.toString(10),
        'did not properly deposit the expected number of tokens');
    });

    it('should emit a StakeIncreased event', async () => {
      await ds.increaseStake(incAmount, { from: staker }).then((status) => {
        assert.strictEqual('StakeIncreased', status.logs[0].event, 'did not emit the StakeIncreased event');
      });
    });
  });
});
