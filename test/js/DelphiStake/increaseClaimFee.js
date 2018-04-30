/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: increaseClaimFee', () => {
    const [staker, claimant, arbiter] = accounts;
    it('should revert if called with an out-of-bounds claimId', async () => {
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

      try {
        await ds.increaseClaimFee(3, 11, { from: arbiter });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if called with an out-of-bounds claimId');
    });
    it('should revert if called on a claim which has already been ruled upon');
    it('should revert if settlement has not yet failed', async () => {
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

      try {
        await ds.increaseClaimFee(0, 11, { from: arbiter });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if settlement has not yet failed');
    });
    it('should transfer the increase _amount from the sender to the contract', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake + 10, { from: staker });

      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      await ds.settlementFailed(0, { from: staker });
      await ds.increaseClaimFee(0, 1, { from: staker });
    });
    it('should increase the surplus fee by the _amount', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake + 10, { from: staker });

      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      await ds.settlementFailed(0, { from: staker });
      let claim1 = await ds.claims.call('0');
      await ds.increaseClaimFee(0, 1, { from: staker });
      claim1 = await ds.claims.call('0');
      assert.strictEqual(claim1[3].toString(10), '1', 'claim surplus fee incorrectly');
    });
    it('should emit a FeeIncreased event', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake + 10, { from: staker });

      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const claimAmount = new BN('1', 10);
      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      await ds.openClaim(claimant, claimAmount, feeAmount, '', { from: claimant });
      await ds.settlementFailed(0, { from: staker });

      await ds.increaseClaimFee(0, 1, { from: staker }).then((status) => {
        assert.strictEqual('FeeIncreased', status.logs[0].event, 'did not emit the FeeIncreased event');
      });
    });
    it('should emit a WithdrawFinalized event'); // ? ? 
    
  });
});
