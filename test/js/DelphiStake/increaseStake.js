/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');

const utils = require('../utils.js');
const BN = require('bignumber.js');

contract('DelphiStake', (accounts) => {
  describe('Function: increaseStake', () => {
    const [staker, , , dave] = accounts;

    it('should revert if called by any entity other than the staker', async () => {
      const ds = await DelphiStake.deployed();
      const incAmount = '1';

      const initialStake = await ds.stake.call();

      try {
        await ds.increaseStake(incAmount, { from: dave, value: incAmount });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalStake = await ds.stake.call();
        assert.strictEqual(initialStake.toString(10), finalStake.toString(10),
          'the stake mysteriously incremented');

        // TODO: check actual balances
        return;
      }

      assert(false, 'should not have allowed somebody other than the staker to increase the stake');
    });

    it('should revert if _value does not equal msg.value', async () => {
      const ds = await DelphiStake.deployed();

      const initialStake = await ds.stake.call();

      try {
        await ds.increaseStake('1', { value: '0', from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalStake = await ds.stake.call();
        assert.strictEqual(initialStake.toString(10), finalStake.toString(10),
          'the stake mysteriously incremented');

        // TODO: check actual balances
        return;
      }

      assert(false, 'should not have allowed the staker to increase the stake by an amount other ' +
        'than that they explicitly specified');
    });

    it('should increment the stake by _value', async () => {
      const ds = await DelphiStake.deployed();
      const incAmount = '1';

      const initialStake = await ds.stake.call();
      await ds.increaseStake(incAmount, { from: staker, value: incAmount });

      const finalStake = await ds.stake.call();
      assert.strictEqual(initialStake.add(new BN(incAmount, 10)).toString(10),
        finalStake.toString(10),
        'did not properly increment stake');

      // TODO: check actual balances
    });

    it('should emit a StakeIncreased event');
  });
});

