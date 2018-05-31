/* eslint-env mocha */
/* global contract artifacts assert  */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: DelphiStake', () => {
    const [staker, , arbiter] = accounts;

    var ds, token;

    beforeEach( async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
    });

    it('should instantiate the contract with the expected values', async () => {
      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const stake = await ds.claimableStake.call();
      assert.strictEqual(stake.toString(10), conf.initialStake,
        'the stake was initialized improperly');

      const tokenaddress = await ds.token.call();
      assert.strictEqual(token.address, tokenaddress,
        'the stake token address was initialized improperly');

      const data = await ds.data.call();
      assert.strictEqual(data, conf.data, 'the stake data was initialized improperly');

      const deadline = await ds.stakeReleaseTime.call();
      assert.strictEqual(deadline.toString(10), conf.deadline,
        'the deadline was initialized improperly');

      const storedArbiter = await ds.arbiter.call();
      assert.strictEqual(arbiter, storedArbiter, 'the arbiter was initialized improperly');

      const balance = await token.balanceOf(ds.address);
      assert.strictEqual(balance.toString(10), stake.toString(10), 'the contract\'s balance and stake did not match');
    });

    it('should revert when _value does not equal the amount of tokens sent', async () => {
      try {
        await utils.as(staker, ds.initDelphiStake, conf.initialStake + 100, token.address,
          conf.minFee, conf.data, conf.deadline, arbiter);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'did not revert after trying to init the stake with an incorrect amount of tokens');
    });

    it('should revert when trying to call the initialize function more than once', async () => {
      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      try {
        await utils.as(staker, ds.initDelphiStake, conf.initialStake, token.address,
          conf.minFee, conf.data, conf.deadline, arbiter);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'did not revert after trying to init the stake more than once');
    });

    it('should revert when trying to call the initialize function with a deadline that is before now', async () => {
      try {
        await utils.as(staker, ds.initDelphiStake, conf.initialStake, token.address,
          conf.minFee, conf.data, '1', arbiter);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'did not revert after trying to call the initialize function with a deadline that is before now');
    });

    it('should revert when trying to initialize with an arbiter of address(0)', async () => {
      try {
        await utils.as(staker, ds.initDelphiStake, conf.initialStake, token.address,
          conf.minFee, conf.data, conf.deadline, '0x0');
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'did not revert after trying to initialize with an arbiter of address(0)');
    });
  });
});
