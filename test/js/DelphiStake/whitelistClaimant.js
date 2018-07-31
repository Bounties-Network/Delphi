/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {//eslint-disable-line
  describe('Function: whitelistClaimant', () => {
    const [staker, claimant, arbiter, other] = accounts;

    let ds;
    let token;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });

      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });
      await token.transfer(arbiter, 1000, { from: staker });

      await ds.initDelphiStake(staker, conf.initialStake, token.address, conf.data,
        conf.deadline, { from: staker });

      const feeAmount = new BN('10', 10);

      await token.approve(ds.address, feeAmount, { from: claimant });
    });

    it('Should revert if called by arbiter', async () => {
      try {
        await ds.whitelistClaimant(claimant, arbiter, conf.minFee, conf.deadline, "", { from: arbiter });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'Expected revert if called by arbiter');
    });

    it('Should revert if called by anyone other than staker', async () => {
      try {
        await ds.whitelistClaimant(claimant, arbiter, conf.minFee, conf.deadline, "", { from: other });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'Expected revert if called by anyone but the staker');
    });

    it('Should properly set the whitelisting to the correct fields', async () => {
      await ds.whitelistClaimant(claimant, arbiter, conf.minFee, '1000', '', { from: staker });
      const whitelist = await ds.whitelists(0);
      assert.strictEqual(whitelist[0], claimant, 'claimant didnt get set correctly');
      assert.strictEqual(whitelist[1], arbiter, 'arbiter didnt get set correctly');
      assert.strictEqual(whitelist[2].toString(10), conf.minFee, 'minFee didnt set correctly');
      assert.strictEqual(whitelist[3].toString(10), '1000', 'deadline didnt set correctly');
    });

    it('Should allow staker to extend the deadline for someone who has already been whitelisted', async () => {
      await ds.whitelistClaimant(claimant, arbiter, conf.minFee, '1000', "", { from: staker });

      await ds.extendClaimDeadline(0, '1001', { from: staker });
      whitelist = await ds.whitelists(0);
      assert.strictEqual(whitelist[3].toString(10), '1001',
        'deadline didnt set correctly');
    });

    it('Should emit ClaimantWhitelisted event', async () => {
      await ds.whitelistClaimant(claimant, arbiter, conf.minFee, '1000', '', { from: staker }).then((status) => {
        assert.strictEqual('ClaimantWhitelisted', status.logs[0].event, 'did not emit the ClaimantWhitelisted event');
      });
    });
  });
});
