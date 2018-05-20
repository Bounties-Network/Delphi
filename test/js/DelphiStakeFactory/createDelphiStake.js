/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStakeFactory = artifacts.require('DelphiStakeFactory');
const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStakeFactory', (accounts) => {
  describe('Function: createDelphiStake', () => {
    const [staker, claimant, arbiter, other] = accounts;

    let df;
    let ds;
    let token;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });
      await token.transfer(other, 100000, { from: staker });

      ds = await DelphiStake.new();
      df = await DelphiStakeFactory.new(ds.address);
    });

    it('should allow the creatation of a single stake', async () => {
      await token.approve(df.address, conf.initialStake, { from: staker });
      await utils.as(staker, df.createDelphiStake, conf.initialStake, token.address,
        conf.minFee, conf.data, conf.deadline, arbiter);

      const numStakes = await df.getNumStakes.call();

      // Ensure that a stake was created, before doing other checks
      assert.strictEqual(numStakes.toString(10), (new BN('1', 10)).toString(10), 'Incorrect number of stakes in the factory');

      // Get the stake's info
      const stake = await DelphiStake.at(await df.stakes.call('0'));
      const value = await stake.claimableStake.call();
      const data = await stake.data.call();
      const owner = await stake.staker.call();

      assert.strictEqual(value.toString(10), conf.initialStake.toString(10), 'Stake not initialized properly');
      assert.strictEqual(data, conf.data, 'Stake not initialized properly');
      assert.strictEqual(owner, staker, 'Stake owner not set correctly');
    });

    it('should allow the creation of multiple stakes', async () => {
      const N = 3; // This is some arbitrary number of stakes to create

      // Create multiple stakes
      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < N; i += 1) {
        await token.approve(df.address, conf.initialStake, { from: staker });
        await utils.as(staker, df.createDelphiStake, conf.initialStake, token.address,
          conf.minFee, i.toString(10), conf.deadline, arbiter);
      }

      const numStakes = await df.getNumStakes.call();

      // Ensure that the stakes were created, before doing other checks
      assert.strictEqual(numStakes.toString(10), (new BN('3', 10)).toString(10), 'Incorrect number of stakes in the factory');

      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < N; i += 1) {
        // Get the stake's
        const stake = await DelphiStake.at(await df.stakes.call(i.toString(10)));
        const value = await stake.claimableStake.call();
        const data = await stake.data.call();
        const owner = await stake.staker.call();

        assert.strictEqual(value.toString(10), conf.initialStake.toString(10), `Stake #${i.toString(10)} not initialized properly`);
        assert.strictEqual(data, i.toString(10), `Stake #${i.toString(10)} not initialized properly`);
        assert.strictEqual(owner, staker, `Stake #${i.toString(10)} owner not set correctly`);
      }
    });

    it('should revert when _value is less than the amount of tokens sent ', async () => {
      await token.approve(df.address, conf.initialStake - 1, { from: staker });

      try {
        await utils.as(staker, df.createDelphiStake, conf.initialStake, token.address,
          conf.minFee, conf.data, conf.deadline, arbiter);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const numStakes = await df.getNumStakes.call();
        assert.strictEqual(numStakes.toString(10), (new BN('0', 10)).toString(10), 'Incorrect number of stakes in the factory');

        return;
      }

      assert(false, 'Expected stake creation to fail');
    });

    it('should revert when trying to call the initialize function with a deadline that is before now', async () => {
      await token.approve(df.address, conf.initialStake, { from: staker });

      try {
        await utils.as(staker, df.createDelphiStake, conf.initialStake, token.address,
          conf.minFee, conf.data, '1', arbiter);
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'did not revert after trying to call the initialize function with a deadline that is before now');
    });

    it('should revert when trying to initialize with an arbiter of address(0)', async () => {
      await token.approve(df.address, conf.initialStake, { from: staker });

      try {
        await utils.as(staker, df.createDelphiStake, conf.initialStake, token.address,
          conf.minFee, conf.data, conf.deadline, '0x0');
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }
      assert(false, 'did not revert after trying to initialize with an arbiter of address(0)');
    });

    it('should emit a StakeCreated event', async () => {
      await token.approve(df.address, conf.initialStake, { from: staker });

      await df.createDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker }).then((status) => {
        assert.strictEqual('StakeCreated', status.logs[0].event, 'did not emit the StakeCreated event');
      });
    });
  });
});
