/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

const Web3 = require('web3');

const web3 = new Web3(Web3.givenProvider || 'ws://localhost:7545');

function sleep(milliseconds) {
  const start = new Date().getTime();
  for (let i = 0; i < 1e7; i += 1) {
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}

contract('DelphiStake', (accounts) => {
  describe('Function: openClaimWithoutSettlement', () => {
    const [staker, claimant, arbiter, other] = accounts;

    const claimAmount = '1';
    const startingClaims = new BN('0', 10);

    var ds, token;

    beforeEach( async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });
      await token.transfer(other, 100000, { from: staker });

      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });
    })

    it('should not allow the arbiter to open a claim', async () => {
      await ds.whitelistClaimant(arbiter, conf.deadline, { from: staker });

      await token.approve(ds.address, conf.minFee, { from: arbiter });

      try {
        await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, '', { from: arbiter });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'Expected claim by arbiter to fail');
    });

    it('should not allow the staker to open a claim', async () => {
      await ds.whitelistClaimant(staker, conf.deadline, { from: staker });

      await token.approve(ds.address, conf.minFee, { from: staker });

      try {
        await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, '', { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim by staker to fail');
    });

    it('should not allow a non-whitelisted individual to open a claim', async () => {
      await token.approve(ds.address, conf.minFee, { from: other });

      try {
        await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, '', { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim by non-whitelisted individual to fail');
    });

    it('should revert if someone is attempting to open a claim after the deadline', async () => {
      await ds.whitelistClaimant(other, parseInt(conf.deadline) - 1, { from: staker });

      await token.approve(ds.address, conf.minFee, { from: claimant });

      try {
        await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, 'claim1', { from: other });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());
        return;
      }

      assert(false, 'expected revert if someone is attempting to open a claim after the deadline');
    });

    it('should revert if _fee is smaller than the minimum', async () => {
      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });

      const feeAmount = parseInt(conf.minFee) - 1;

      await token.approve(ds.address, feeAmount, { from: claimant });

      try {
        await ds.openClaimWithoutSettlement(claimAmount, feeAmount, '', { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim for more than is available in stake to fail');
    });

    it('should revert if _amount + _fee is greater than the available stake', async () => {
      const amount = parseInt(conf.minFee) + parseInt(conf.initialStake) + 1;

      await token.approve(ds.address, amount, { from: claimant });

      try {
        await ds.openClaimWithoutSettlement(claimAmount, amount, '', { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim for more than is available in stake to fail');
    });

    it('should revert if the fee is not transferred with the transaction', async () => {
      try {
        await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, '', { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.openClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected revert if the fee is not transferred with the transaction');
    });

    it('should increment the getNumClaims counter', async () => {
      await token.approve(ds.address, conf.minFee, { from: claimant });

      await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, '', { from: claimant });

      const finalClaims = await ds.getNumClaims();
      assert.strictEqual(startingClaims.add(new BN('1', 10)).toString(10),
        finalClaims.toString(10),
        'claim counter not incremented as-expected');
    });

    it('should add a new claim to the claims array and properly initialize its properties',
      async () => {
        await token.approve(ds.address, conf.minFee, { from: claimant });

        const claimId = await ds.getNumClaims();

        await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, 'newclaim', { from: claimant });

        const claim = await ds.claims.call(claimId);

        assert.strictEqual(claim[0],              claimant,    'initialized claimant incorrectly');
        assert.strictEqual(claim[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
        assert.strictEqual(claim[2].toString(10), conf.minFee, 'initialized claim fee incorrectly');
        assert.strictEqual(claim[3].toString(10), '0',         'initialized claim surplus fee incorrectly');
        assert.strictEqual(claim[4],              'newclaim',  'initialized claim data incorrectly');
        assert.strictEqual(claim[5].toString(10), '0',         'initialized claim ruling incorrectly');
        assert.strictEqual(claim[6],              false,       'initialized ruled bool incorrectly');
        assert.strictEqual(claim[7],              true,        'initialized settlementFailed incorrectly');
      });

    it('should increment the openClaims.call counter', async () => {
      await token.approve(ds.address, conf.minFee, { from: claimant });

      await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, '', { from: claimant });

      const finalClaims = await ds.openClaims();
      assert.strictEqual(startingClaims.add(new BN('1', 10)).toString(10),
        finalClaims.toString(10),
        'claim counter not incremented as-expected');
    });

    it('should decrement the stakers stake by amount + fee', async () => {
      await token.approve(ds.address, conf.minFee, { from: claimant });

      const startingStake = await ds.claimableStake.call();

      await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, '', { from: claimant });

      const finalStake = await ds.claimableStake();
      assert.strictEqual(startingStake.sub(new BN(claimAmount, 10).add(conf.minFee)).toString(10),
        finalStake.toString(10),
        'stake was not decremented as-expected when a new claim was opened');

      const newBalance = await token.balanceOf(ds.address);
      assert.strictEqual(startingStake.add(conf.minFee).toString(10), newBalance.toString(10),
        'balance does not reflect the originally deposited funds and additional fee');
    });

    it('should emit a NewClaim event', async () => {
      await token.approve(ds.address, conf.minFee, { from: claimant });

      await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, 'claim1', { from: claimant }).then((status) => {
        assert.strictEqual('ClaimOpened', status.logs[0].event, 'did not emit the NewClaim event');
      });
    });

    it('should append claims to the end of the claim array, without overwriting earlier claims', async () => {

      await token.approve(ds.address, conf.minFee, { from: claimant });
      await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, 'claim1', { from: claimant });

      await token.approve(ds.address, conf.minFee, { from: claimant });
      await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, 'claim2', { from: claimant });

      await token.approve(ds.address, conf.minFee, { from: claimant });
      await ds.openClaimWithoutSettlement(claimAmount, conf.minFee, 'claim3', { from: claimant });

      const claim1 = await ds.claims.call('0');

      assert.strictEqual(claim1[0],              claimant,    'initialized claimant incorrectly');
      assert.strictEqual(claim1[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
      assert.strictEqual(claim1[2].toString(10), conf.minFee, 'initialized claim fee incorrectly');
      assert.strictEqual(claim1[3].toString(10), '0',         'initialized claim surplus fee incorrectly');
      assert.strictEqual(claim1[4],              'claim1',    'initialized claim data incorrectly');
      assert.strictEqual(claim1[5].toString(10), '0',         'initialized claim ruling incorrectly');
      assert.strictEqual(claim1[6],              false,       'initialized ruled bool incorrectly');
      assert.strictEqual(claim1[7],              true,        'initialized settlementFailed incorrectly');

      const claim2 = await ds.claims.call('1');

      assert.strictEqual(claim2[0],              claimant,    'initialized claimant incorrectly');
      assert.strictEqual(claim2[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
      assert.strictEqual(claim2[2].toString(10), conf.minFee, 'initialized claim fee incorrectly');
      assert.strictEqual(claim2[3].toString(10), '0',         'initialized claim surplus fee incorrectly');
      assert.strictEqual(claim2[4],              'claim2',    'initialized claim data incorrectly');
      assert.strictEqual(claim2[5].toString(10), '0',         'initialized claim ruling incorrectly');
      assert.strictEqual(claim2[6],              false,       'initialized ruled bool incorrectly');
      assert.strictEqual(claim2[7],              true,        'initialized settlementFailed incorrectly');

      const claim3 = await ds.claims.call('2');

      assert.strictEqual(claim3[0],              claimant,    'initialized claimant incorrectly');
      assert.strictEqual(claim3[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
      assert.strictEqual(claim3[2].toString(10), conf.minFee, 'initialized claim fee incorrectly');
      assert.strictEqual(claim3[3].toString(10), '0',         'initialized claim surplus fee incorrectly');
      assert.strictEqual(claim3[4],              'claim3',    'initialized claim data incorrectly');
      assert.strictEqual(claim3[5].toString(10), '0',         'initialized claim ruling incorrectly');
      assert.strictEqual(claim3[6],              false,       'initialized ruled bool incorrectly');
      assert.strictEqual(claim3[7],              true,        'initialized settlementFailed incorrectly');
    });
  });
});
