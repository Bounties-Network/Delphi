/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');

const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');

const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: acceptSettlement', () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 10, { from: staker });
      try {
        await ds.acceptSettlement(2, 0, { from: claimant });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if called with an out-of-bounds claimId');
    });
    it('Should revert if called with an out-of-bounds settlementId', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 10, { from: staker });
      try {
        await ds.acceptSettlement(0, 2, { from: claimant });
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: staker });
      try {
        await ds.acceptSettlement(0, 0, { from: thirdPary });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if called by anyone but the staker or the claimant corresponding to the claimId');
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: staker });

      await ds.settlementFailed(0, { from: claimant });
      try {
        await ds.acceptSettlement(0, 0, { from: claimant });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if settlement has failed');
    });
    it('Should set the stakerAgrees to true when called by a staker on a claimants settlement', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: claimant });

      let settlement = await ds.settlements(0, 0, { from: staker });
      assert.strictEqual(settlement[1], false, 'staker agree');
      await ds.acceptSettlement(0, 0, { from: staker });
      settlement = await ds.settlements(0, 0, { from: staker });
      assert.strictEqual(settlement[1], true, 'staker did not agree');

      try {
        await ds.acceptSettlement(0, 0, { from: thirdPary });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if other party\' accept settlement ');
    });
    it('Should set the claimantAgrees to true when called by a claimant on a claimants settlement', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: claimant });
      const settlement = await ds.settlements(0, 0, { from: staker });
      assert.strictEqual(settlement[2], true, 'claimant did not agree');
      try {
        await ds.acceptSettlement(0, 0, { from: thirdPary });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if other party\' accept settlement ');
    });
    it('Should revert if called by a staker on their own settlement', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: staker });

      try {
        await ds.acceptSettlement(0, 0, { from: staker });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if called by a staker on their own settlement');
    });
    it('Should revert if called by a claimant on their own settlement', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: claimant });

      try {
        await ds.acceptSettlement(0, 0, { from: claimant });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if called by a claimant on their own settlement');
    });

    it('Should revert if the settlement has failed', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      const openclaims = await ds.openClaims();

      assert.strictEqual(openclaims.toString(10), '1', 'openClaims value is not correctly');

      await ds.proposeSettlement(0, 0, { from: claimant });

      await ds.settlementFailed(0, { from: staker }); // As other party

      try {
        // This function do not entry in {file:DelphiStake.sol,line 342} 
        // because it is already checked in line {file:DelphiStake.sol,line 325}
        await ds.acceptSettlement(0, 0, { from: claimant });
      } catch (err) {
        return;
      }
      assert(false, 'Expected revert if called by a staker on their own settlement');
    });

    it('Should revert if a claim\'s settlement has been accepted', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      const openclaims = await ds.openClaims();

      assert.strictEqual(openclaims.toString(10), '1', 'openClaims value is not correctly');

      await ds.proposeSettlement(0, 0, { from: claimant });

      await ds.acceptSettlement(0, 0, { from: staker });
      const claim1 = await ds.claims.call('0');
      assert.strictEqual(claim1[6], true, 'Ruled bool is not correct');

      try {
        await ds.acceptSettlement(0, 0, { from: claimant });
      } catch (err) {
        return;
      }
      assert(false, 'Expected to revert if a claim\'s settlement has been accepted');
    });

    it('Should set the claim.ruled to true', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: claimant });
      await ds.acceptSettlement(0, 0, { from: staker });
      const claim = await ds.claims.call('0');
      assert.strictEqual(claim[6], true, 'wrong ruled false, Expected true');
    });
    it('Should return the unused claim funds from the staker back to their stake', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      let claimableStake = await ds.claimableStake();
      assert.strictEqual(claimableStake.toString(10), '89', 'Expected 89 tokens available');

      await ds.proposeSettlement(0, 0, { from: claimant });
      await ds.acceptSettlement(0, 0, { from: staker });
      claimableStake = await ds.claimableStake();
      assert.strictEqual(claimableStake.toString(10), '100', 'Expected 100 tokens available');
    });
    it('Should decrement the number of open claims', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      let openclaims = await ds.openClaims();

      assert.strictEqual(openclaims.toString(10), '1', 'openClaims value is not correctly');

      await ds.proposeSettlement(0, 0, { from: claimant });
      await ds.acceptSettlement(0, 0, { from: staker });
      openclaims = await ds.openClaims();
      assert.strictEqual(openclaims.toString(10), '0', 'openClaims value is not correctly');
    });
    it('Should transfer the settlement amount, plus their original deposit, back to the claimant', async () => {
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

      const originalClaimantBalance = await token.balanceOf(claimant);
      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      let claimantBalance = await token.balanceOf(claimant);
      assert.strictEqual((originalClaimantBalance - 10).toString(10), claimantBalance.toString(10), 'Expected less claimant balance');
      await ds.proposeSettlement(0, 0, { from: claimant });
      await ds.acceptSettlement(0, 0, { from: staker });

      claimantBalance = await token.balanceOf(claimant);

      assert.strictEqual(originalClaimantBalance.toString(10), claimantBalance.toString(10), 'Expected equal claimant balance');
    });
    it('Should emit a SettlementAccepted event', async () => {
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

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });

      await ds.proposeSettlement(0, 0, { from: claimant });
      await ds.acceptSettlement(0, 0, { from: staker }).then((status) => {
        assert.strictEqual('SettlementAccepted', status.logs[0].event, 'did not emit the SettlementAccepted event');
      });
    });
  });
});
