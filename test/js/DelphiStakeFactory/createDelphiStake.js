/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStakeFactory = artifacts.require('DelphiStakeFactory');
const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStakeFactory', (accounts) => {
  describe('Function: openClaim', () => {
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

      await token.approve(df.address, conf.initialStake, { from: staker });
    });

    it('should set the master contract correctly', async () => {
      assert.strictEqual(await df.masterCopy.call(), ds.address, 'The master contract did not load properly');
    });

    it('should allow someone to create a single stake', async () => {
      df.createDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const numStakes = await df.getNumStakes.call();

      // Ensure that a stake was created, before doing other checks
      assert.strictEqual(numStakes.toString(10), (new BN('1', 10)).toString(10), 'Incorrect number of stakes in the factory');

      // Get the stake's
      const stake = DelphiStake.at(await df.stakes.call('0'));
      const value = await stake.claimableStake.call();
      const data = await stake.data.call();

      assert.strictEqual(value.toString(10), conf.initialStake.toString(10), 'Stake not initialized properly');
      assert.strictEqual(data, conf.data, 'Stake not initialized properly');

      // try {
      //   await ds.openClaim(claimAmount, feeAmount, '', { from: arbiter });
      // } catch (err) {
      //   assert(utils.isEVMRevert(err), err.toString());
      //
      //   const finalClaims = await ds.getNumClaims.call();
      //   assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
      //     'claims counter incremented mysteriously');
      //
      //   return;
      // }
      //
      // assert(false, 'Expected claim by arbiter to fail');


    });

  });
});
