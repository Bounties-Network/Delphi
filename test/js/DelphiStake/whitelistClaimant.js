/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {//eslint-disable-line
  describe('Function: whitelistClaimant', () => {
    const [staker, claimant, arbiter] = accounts;

    it('should revert if called by anyone but the staker', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      try {
        await ds.whitelistClaimant(claimant, conf.deadline, { from: arbiter });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'Expected revert if called by anyone but the staker');
    });

    it('should properly set the _claimant address to the given deadline', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, '1000', { from: staker });
      const whitelisten = await ds.whitelistedDeadlines(claimant, { from: staker });
      assert.strictEqual(whitelisten.toString(10), '1000',
        'deadline didnt set correctly');
    });
    it('should allow me to extend the deadline for someone who has already been whitelisted', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, '1000', { from: staker });
      let whitelisten = await ds.whitelistedDeadlines(claimant, { from: staker });
      assert.strictEqual(whitelisten.toString(10), '1000',
        'deadline didnt set correctly');

      await ds.whitelistClaimant(claimant, '1001', { from: staker });
      whitelisten = await ds.whitelistedDeadlines(claimant, { from: staker });
      assert.strictEqual(whitelisten.toString(10), '1001',
        'deadline didnt set correctly');
    });
    it('should emit ClaimantWhitelisted event', async () => {
      const token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      const ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.whitelistClaimant(claimant, '1000', { from: staker }).then((status) => {
        assert.strictEqual('ClaimantWhitelisted', status.logs[0].event, 'did not emit the ClaimantWhitelisted event');
      });
    });
  });
});
