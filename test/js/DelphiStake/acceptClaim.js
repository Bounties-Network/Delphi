/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: acceptClaim', () => {
    const [staker, claimant, arbiter, other] = accounts;

    const claimAmount = '1';
    const startingClaims = new BN('0', 10);

    let ds;
    let token;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });
      await token.transfer(other, 100000, { from: staker });

      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(staker, conf.initialStake, token.address, conf.data,
        conf.deadline, { from: staker });

      await ds.whitelistClaimant(claimant, arbiter, conf.minFee, conf.deadline, "", { from: staker });

      await token.approve(ds.address, conf.minFee, { from: claimant });

      await ds.openClaim(0, claimAmount, conf.minFee, '', { from: claimant });

    });

    it('should not allow a non-staker to accept a claim', async () => {
      try {
        await ds.acceptClaim(0, { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        let claim = await ds.claims(0);
        assert(parseInt(claim[6], 10) == 0, 'allowed claimant to accept their own claim');

        return;
      }

      assert(false, 'expected claim acceptance by non-issuer to fail');
    });

    it('should not allow a staker to accept a claim outside the length of the claims array', async () => {
      try {
        await ds.acceptClaim(1, { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        let claim = await ds.claims(0);
        assert(parseInt(claim[6], 10) == 0, 'allowed claimant to accept their own claim');

        return;
      }

      assert(false, 'expected claim acceptance of out of bounds claim to fail');
    });

    it('should not allow a staker to accept a claim whose settlement has failed', async () => {
      await token.approve(ds.address, conf.minFee, { from: claimant });

      await ds.openClaimWithoutSettlement(0, claimAmount, conf.minFee, '', { from: claimant });

      try {
        await ds.acceptClaim(1, { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        let claim = await ds.claims(1);
        assert(parseInt(claim[6], 10) == 0, 'allowed claimant to accept their own claim');

        return;
      }

      assert(false, 'expected claim acceptance of out of bounds claim to fail');
    });

    it('should allow a staker to accept a claim', async () => {

      await ds.acceptClaim(0, { from: staker });

      let balance = await token.balanceOf(claimant);

      assert(parseInt(balance, 10) == 100001);

      let claim = await ds.claims(0);

      assert(parseInt(claim[6], 10) == 5);

    });

    it('should emit an event for accepting a claim', async () => {
      await ds.acceptClaim(0, { from: staker }).then((status) => {
        assert.strictEqual('ClaimAccepted', status.logs[0].event, 'did not emit the ClaimAccepted event');
      });
    });

  });
});
