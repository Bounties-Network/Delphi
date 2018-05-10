/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');

const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: proposeSettlement', () => {
    const [staker, claimant, arbiter, thirdPary] = accounts;
    it('Should revert if called with an out-of-bounds claimId', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      try {
        await ds.proposeSettlement(2, 9, { from: thirdPary });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if called with an out-of-bounds claimId');
    });
    it('Should revert if called by anyone but the staker or the claimant corresponding to the claimId', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      try {
        await ds.proposeSettlement(0, 9, { from: thirdPary });
      } catch (err) {
        return;
      }
      assert(false,
        'Expected revert if called by anyone but the staker or the claimant corresponding to the claimId');
    });
    it('Should revert if settlement has failed', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      await ds.settlementFailed(0, { from: staker });
      try {
        await ds.proposeSettlement(0, 9, { from: staker });
      } catch (err) {
        return;
      }
      assert(false,
        'Expected to revert if settlement has failed');
    });
    it('Should revert if the proposed settlement _amount is more than the sum of the amount and fee of the claim in question', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      try {
        await ds.proposeSettlement(0, 12, { from: claimant });
      } catch (err) {
        return;
      }
      assert(false,
        'Expected revert if the proposed settlement _amount is less than the sum of the amount and fee of the claim in question');
    });
    it('Should create a new settlement by the claimant, and have the settlement properly initialize the fields', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 10, { from: claimant });
      const settlement = await ds.settlements(0, 0, { from: staker });
      assert.strictEqual(settlement[0].toString(10), '10', 'initialized amount incorrectly');
      assert.strictEqual(settlement[1], false, 'staker agree');
      assert.strictEqual(settlement[2], true, 'claimant did not agree');
    });
    it('Should create a new settlement by the staker, and have the settlement properly initialize the fields', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 10, { from: staker });
      const settlement = await ds.settlements(0, 0, { from: staker });
      assert.strictEqual(settlement[0].toString(10), '10', 'initialized amount incorrectly');
      assert.strictEqual(settlement[1], true, 'staker did not agree');
      assert.strictEqual(settlement[2], false, 'claimant agree');
    });
    it('Should emit a SettlementProposed event', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 10, { from: staker }).then((status) => {
        assert.strictEqual('SettlementProposed', status.logs[0].event, 'did not emit the SettlementProposed event');
      });
    });
  });
});
