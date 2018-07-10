/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiVoting = artifacts.require('DelphiVoting');
const DelphiStake = artifacts.require('DelphiStake');
const DelphiStakeFactory = artifacts.require('DelphiStakeFactory');
const DelphiVotingFactory = artifacts.require('DelphiVotingFactory');
const RegistryFactory = artifacts.require('tcr/RegistryFactory.sol');
const Registry = artifacts.require('tcr/Registry.sol');
const EIP20 = artifacts.require('tokens/eip20/EIP20.sol');
const LookupTable = artifacts.require('LookupTable');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const HttpProvider = require('ethjs-provider-http');
const EthRPC = require('ethjs-rpc');
const Web3 = require('web3');

const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:7545'));
const rpc = new EthRPC(new HttpProvider('http://localhost:7545'));

const solkeccak = Web3.utils.soliditySha3;

contract('DelphiVoting', (accounts) => {
  describe('Function: claimFee', () => {
    const [staker, claimant, arbiterAlice, arbiterBob, arbiterCharlie, arbiterDanielle,
      arbiterEdwin, arbiterFederika, arbiterGale, arbiterHenry] = accounts;

    let delphiStake;
    let delphiVoting;
    let token;

    beforeEach(async () => {
      // Get deployed factory contracts
      const delphiVotingFactory = await DelphiVotingFactory.deployed();
      const delphiStakeFactory = await DelphiStakeFactory.deployed();
      const registryFactory = await RegistryFactory.deployed();

      // Create a new registry and curation token
      const registryReceipt = await registryFactory.newRegistryWithToken(
        1000000,
        'RegistryCoin',
        0,
        'REG',
        [100, 100, 100, 100, 100, 100, 100, 100, 60, 60, 50, 50],
        'The Arbiter Registry',
      );

      // Get instances of the registry and its token
      const registryToken = EIP20.at(registryReceipt.logs[0].args.token);
      const registry = Registry.at(registryReceipt.logs[0].args.registry);

      // Give 100k REG to each account, and approve the Registry to transfer it
      await Promise.all(accounts.map(async (account) => {
        await registryToken.transfer(account, 100000);
        await registryToken.approve(registry.address, 100, { from: account });
      }));

      // Apply Alice, Bob, and Charlie to the registry
      await registry.apply(solkeccak(arbiterAlice), 100, '', { from: arbiterAlice });
      await registry.apply(solkeccak(arbiterBob), 100, '', { from: arbiterBob });
      await registry.apply(solkeccak(arbiterCharlie), 100, '', { from: arbiterCharlie });
      await registry.apply(solkeccak(arbiterDanielle), 100, '', { from: arbiterDanielle });
      await registry.apply(solkeccak(arbiterEdwin), 100, '', { from: arbiterEdwin });
      await registry.apply(solkeccak(arbiterFederika), 100, '', { from: arbiterFederika });
      await registry.apply(solkeccak(arbiterGale), 100, '', { from: arbiterGale });
      await registry.apply(solkeccak(arbiterHenry), 100, '', { from: arbiterHenry });

      // Increase time past the registry application period
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Add arbiters to the Registry
      await registry.updateStatus(solkeccak(arbiterAlice));
      await registry.updateStatus(solkeccak(arbiterBob));
      await registry.updateStatus(solkeccak(arbiterCharlie));
      await registry.updateStatus(solkeccak(arbiterDanielle));
      await registry.updateStatus(solkeccak(arbiterEdwin));
      await registry.updateStatus(solkeccak(arbiterFederika));
      await registry.updateStatus(solkeccak(arbiterGale));
      await registry.updateStatus(solkeccak(arbiterHenry));

      // Create a DelphiVoting with 100 second voting periods, fee decay value of five, 
      // and which uses the registry we just created as its arbiter set
      const delphiVotingReceipt = await delphiVotingFactory.makeDelphiVoting(registry.address,
        5, [solkeccak('parameterizerVotingPeriod'), solkeccak('commitStageLen'),
          solkeccak('revealStageLen')],
        [100, 100, 100]);
      delphiVoting = DelphiVoting.at(delphiVotingReceipt.logs[0].args.delphiVoting);

      // Pre-compute LookupTable values
      const lookupTable = LookupTable.at(await delphiVoting.lt.call());
      await lookupTable.getGuaranteedPercentageForIndex(10);

      // Create DisputeCoin and give 100k DIS to each account
      token = await EIP20.new(1000000, 'DisputeCoin', 0, 'DIS');
      await Promise.all(accounts.map(async account => token.transfer(account, 100000)));

      // Create a DelphiStake with 90k DIS tokens, 1k minFee, and a release time 1k seconds
      // from now
      await token.approve(delphiStakeFactory.address, 90000, { from: staker });
      const expirationTime = (await web3.eth.getBlock('latest')).timestamp + 1000;
      const delphiStakeReceipt = await delphiStakeFactory.createDelphiStake(90000, token.address,
        1000, '', expirationTime, delphiVoting.address, { from: staker });
      // eslint-disable-next-line
      delphiStake = DelphiStake.at(delphiStakeReceipt.logs[0].args._contractAddress);
    });

    it('should allow an arbiter to claim a fee', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
      await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Claim fee. Capture the arbiters balance before and after.
      const startingBalance = await token.balanceOf(arbiterAlice);
      await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
        { from: arbiterAlice });
      const finalBalance = await token.balanceOf(arbiterAlice);

      // The arbiter's final balance should be their starting balance plus the entire FEE_AMOUNT,
      // since they were the only voter and should get the whole amount
      assert.strictEqual(finalBalance.toString(10),
        startingBalance.add(new BN(FEE_AMOUNT, 10)).toString(10));
    });

    it('should not allow an arbiter to claim a fee twice', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
      await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Claim fee. Capture the arbiters balance before and after.
      await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
        { from: arbiterAlice });

      // Add tokens to the delphiVoting contract so it doesn't fail on an insufficient balance
      // when we try to claim again
      await token.transfer(delphiVoting.address, FEE_AMOUNT);

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'an arbiter was able to claim a fee twice');
    });

    it('should not allow an arbiter to claim a fee when they voted out of the plurality',
      async () => {
        // Set constants
        const CLAIM_AMOUNT = '10000';
        const FEE_AMOUNT = '1000';
        const PLURALITY_VOTE = '1';
        const NON_PLURALITY_VOTE = '0';
        const SALT = '420';

        // Compute secret hashes for the plurality and non-plurality vote options
        const pluralitySecretHash = utils.getSecretHash(PLURALITY_VOTE, SALT);
        const nonPluralitySecretHash = utils.getSecretHash(NON_PLURALITY_VOTE, SALT);

        // Make a new claim and compute its claim ID.
        const claimNumber =
          await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
            delphiStake);
        const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

        // Arbiters commit votes. Charlie commits the non-plurality vote.
        await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
          { from: arbiterAlice });
        await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
          { from: arbiterBob });
        await delphiVoting.commitVote(delphiStake.address, claimNumber, nonPluralitySecretHash,
          { from: arbiterCharlie });

        // Increase time to get to the reveal phase
        await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

        // Arbiters reveal votes
        const insertPointAlice =
          await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, PLURALITY_VOTE);
        await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointAlice,
          { from: arbiterAlice });
        const insertPointBob =
          await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, PLURALITY_VOTE);
        await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointBob,
          { from: arbiterBob });
        const insertPointCharlie =
          await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, NON_PLURALITY_VOTE);
        await delphiVoting.revealVote(claimId, NON_PLURALITY_VOTE, SALT, insertPointCharlie,
          { from: arbiterCharlie });

        // Increase time to finish the reveal phase so we can submit the ruling
        await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

        // Submit ruling
        await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

        // Capture Charlie's starting balance
        const startingBalance = await token.balanceOf(arbiterCharlie);
        try {
          // non-plurality arbiter, Charlie, attempts claim fee
          await delphiVoting.claimFee(delphiStake.address, claimNumber, NON_PLURALITY_VOTE,
            SALT, { from: arbiterCharlie });
        } catch (err) {
          assert(utils.isEVMRevert(err), err.toString());

          // Charlie's final balance should be equal to his starting balance
          const finalBalance = await token.balanceOf(arbiterCharlie);
          assert.strictEqual(finalBalance.toString(10), startingBalance.toString(10),
            'An unnacountable state change occurred');

          return;
        }

        assert(false, 'An arbiter who voted out of the plurality was able to claim fees');
      });

    it('should apportion the fee properly when multiple arbiters must claim', async () => {
      // Set constants
      const CLAIM_AMOUNT = '50000';
      const FEE_AMOUNT = new BN('10000', 10);
      const PLURALITY_VOTE = '1';
      const SALT = '420';

      // Compute secret hashes for the plurality and non-plurality vote options
      const pluralitySecretHash = utils.getSecretHash(PLURALITY_VOTE, SALT);

      // Make a new claim and compute its claim ID.
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Arbiters commit votes.
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterAlice });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterBob });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Arbiters reveal votes
      const insertPointAlice =
        await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointAlice,
        { from: arbiterAlice });
      const insertPointBob =
        await delphiVoting.getInsertPoint.call(claimId, arbiterBob, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointBob,
        { from: arbiterBob });

      // Increase time to finish the reveal phase so we can submit the ruling
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Claim the fee and get Alice's final balance
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterAlice });
      const finalBalanceAlice = await token.balanceOf(arbiterAlice);

      // Alice's expected final balance is her starting balance plus (20 + 32)% of the fee
      const expectedFinalBalanceAlice = '105200';
      assert.strictEqual(finalBalanceAlice.toString(10), expectedFinalBalanceAlice.toString(10),
        'Alice did not get the proper fee allocation');

      // Claim the fee and get Bob's final balance
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterBob });
      const finalBalanceBob = await token.balanceOf(arbiterBob);

      // Bob's expected final balance is his starting balance plus (16 + 32)% of the fee
      const expectedFinalBalanceBob = '104800';
      assert.strictEqual(finalBalanceBob.toString(10), expectedFinalBalanceBob.toString(10),
        'Bob did not get the proper fee allocation');
    });

    it('should apportion the fee properly when a large number of arbiters claim in random ' +
      'orders', async () => {
      // Set constants
      const CLAIM_AMOUNT = '50000';
      const FEE_AMOUNT = new BN('10000', 10);
      const PLURALITY_VOTE = '1';
      const SALT = '420';

      // Compute secret hashes for the plurality and non-plurality vote options
      const pluralitySecretHash = utils.getSecretHash(PLURALITY_VOTE, SALT);

      // Make a new claim and compute its claim ID.
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Arbiters commit votes.
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterAlice });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterBob });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterCharlie });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterDanielle });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterEdwin });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterFederika });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterGale });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterHenry });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Arbiters reveal votes
      const insertPointAlice =
        await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointAlice,
        { from: arbiterAlice });
      const insertPointBob =
        await delphiVoting.getInsertPoint.call(claimId, arbiterBob, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointBob,
        { from: arbiterBob });
      const insertPointCharlie =
        await delphiVoting.getInsertPoint.call(claimId, arbiterCharlie, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointCharlie,
        { from: arbiterCharlie });
      const insertPointDanielle =
        await delphiVoting.getInsertPoint.call(claimId, arbiterDanielle, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointDanielle,
        { from: arbiterDanielle });
      const insertPointEdwin =
        await delphiVoting.getInsertPoint.call(claimId, arbiterEdwin, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointEdwin,
        { from: arbiterEdwin });
      const insertPointFederika =
        await delphiVoting.getInsertPoint.call(claimId, arbiterFederika, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointFederika,
        { from: arbiterFederika });
      const insertPointGale =
        await delphiVoting.getInsertPoint.call(claimId, arbiterGale, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointGale,
        { from: arbiterGale });
      const insertPointHenry =
        await delphiVoting.getInsertPoint.call(claimId, arbiterHenry, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointHenry,
        { from: arbiterHenry });

      // Increase time to finish the reveal phase so we can submit the ruling
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Claim fees
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterFederika });
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterAlice });
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterBob });
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterCharlie });
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterDanielle });
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterEdwin });
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterGale });
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterHenry });

      // Alice's expected final balance is her starting balance plus (20 + 2.37)% of the fee
      const finalBalanceAlice = await token.balanceOf(arbiterAlice);
      const expectedFinalBalanceAlice = '102237';
      assert.strictEqual(finalBalanceAlice.toString(10), expectedFinalBalanceAlice.toString(10),
        'Alice did not get the proper fee allocation');

      // Bob's expected final balance is his starting balance plus (16 + 2.37)% of the fee
      const finalBalanceBob = await token.balanceOf(arbiterBob);
      const expectedFinalBalanceBob = '101837';
      assert.strictEqual(finalBalanceBob.toString(10), expectedFinalBalanceBob.toString(10),
        'Bob did not get the proper fee allocation');

      // Charlie's expected final balance is his starting balance plus (12 + 2.37)% of the fee
      const finalBalanceCharlie = await token.balanceOf(arbiterCharlie);
      const expectedFinalBalanceCharlie = '101437';
      assert.strictEqual(finalBalanceCharlie.toString(10),
        expectedFinalBalanceCharlie.toString(10),
        'Charlie did not get the proper fee allocation');

      // Danielle's expected final balance is her starting balance plus (10 + 2.37)% of the fee
      const finalBalanceDanielle = await token.balanceOf(arbiterDanielle);
      const expectedFinalBalanceDanielle = '101237';
      assert.strictEqual(finalBalanceDanielle.toString(10),
        expectedFinalBalanceDanielle.toString(10),
        'Danielle did not get the proper fee allocation');

      // Edwin's expected final balance is his starting balance plus (8 + 2.37)% of the fee
      const finalBalanceEdwin = await token.balanceOf(arbiterEdwin);
      const expectedFinalBalanceEdwin = '101037';
      assert.strictEqual(finalBalanceEdwin.toString(10), expectedFinalBalanceEdwin.toString(10),
        'Edwin did not get the proper fee allocation');

      // Federika's expected final balance is her starting balance plus (6 + 2.37)% of the fee
      const finalBalanceFederika = await token.balanceOf(arbiterFederika);
      const expectedFinalBalanceFederika = '100837';
      assert.strictEqual(finalBalanceFederika.toString(10),
        expectedFinalBalanceFederika.toString(10),
        'Federika did not get the proper fee allocation');

      // Gale's expected final balance is her starting balance plus (5 + 2.37)% of the fee
      const finalBalanceGale = await token.balanceOf(arbiterGale);
      const expectedFinalBalanceGale = '100737';
      assert.strictEqual(finalBalanceGale.toString(10), expectedFinalBalanceGale.toString(10),
        'Gale did not get the proper fee allocation');

      // Henry's expected final balance is his starting balance plus (4 + 2.37)% of the fee
      const finalBalanceHenry = await token.balanceOf(arbiterHenry);
      const expectedFinalBalanceHenry = '100637';
      assert.strictEqual(finalBalanceHenry.toString(10), expectedFinalBalanceHenry.toString(10),
        'Henry did not get the proper fee allocation');
    });

    it('should revert if called by anyone but one of the arbiters', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
      await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expected to revert if called by anyone but one of the arbiters');
    });

    it('should not allow an arbiter to claim a fee when they did not commit', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Reveal vote
      const insertPoint = await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, VOTE);
      await delphiVoting.revealVote(claimId, VOTE, SALT, insertPoint, { from: arbiterAlice });

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: arbiterBob });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expetected to not allow an arbiter to claim a fee when they did not commit');
    });

    it('should not allow an arbiter to claim a fee when they committed but did not reveal', async () => {
      // Set constants
      const CLAIM_AMOUNT = '10000';
      const FEE_AMOUNT = '1000';
      const VOTE = '1';
      const SALT = '420';

      // Make a new claim and get its claimId
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);

      // Get the secret hash for the salted vote
      const secretHash = utils.getSecretHash(VOTE, SALT);

      // Commit vote
      await delphiVoting.commitVote(delphiStake.address, claimNumber, secretHash,
        { from: arbiterAlice });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // DO NOT reveal vote

      // Increase time to finish the reveal phase so we can submit
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      try {
        await delphiVoting.claimFee(delphiStake.address, claimNumber, VOTE, SALT,
          { from: arbiterAlice });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        return;
      }

      assert(false, 'Expetected to not allow an arbiter to claim a fee when they committed but did not reveal');
    });

    it('should apportion the fee properly when arbiter consensus is under 100%', async () => {
      // Set constants
      const CLAIM_AMOUNT = '50000';
      const FEE_AMOUNT = new BN('10000', 10);
      const PLURALITY_VOTE = '1';
      const NON_PLURALITY_VOTE = '0';
      const SALT = '420';

      // Compute secret hashes for the plurality and non-plurality vote options
      const pluralitySecretHash = utils.getSecretHash(PLURALITY_VOTE, SALT);
      const nonPluralitySecretHash = utils.getSecretHash(NON_PLURALITY_VOTE, SALT);

      // Make a new claim and compute its claim ID.
      const claimNumber =
        await utils.makeNewClaim(staker, claimant, CLAIM_AMOUNT, FEE_AMOUNT, 'i love cats',
          delphiStake);
      const claimId = utils.getClaimId(delphiStake.address, claimNumber.toString(10));

      // Arbiters commit votes.
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterAlice });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterBob });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, pluralitySecretHash,
        { from: arbiterCharlie });
      await delphiVoting.commitVote(delphiStake.address, claimNumber, nonPluralitySecretHash,
        { from: arbiterDanielle });

      // Increase time to get to the reveal phase
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [101] });

      // Arbiters reveal votes
      const insertPointAlice =
        await delphiVoting.getInsertPoint.call(claimId, arbiterAlice, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointAlice,
        { from: arbiterAlice });
      const insertPointBob =
        await delphiVoting.getInsertPoint.call(claimId, arbiterBob, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointBob,
        { from: arbiterBob });
      const insertPointCharlie =
        await delphiVoting.getInsertPoint.call(claimId, arbiterCharlie, PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, PLURALITY_VOTE, SALT, insertPointCharlie,
        { from: arbiterCharlie });
      const insertPointDanielle =
        await delphiVoting.getInsertPoint.call(claimId, arbiterDanielle, NON_PLURALITY_VOTE);
      await delphiVoting.revealVote(claimId, NON_PLURALITY_VOTE, SALT, insertPointDanielle,
        { from: arbiterDanielle });

      // Increase time to finish the reveal phase so we can submit the ruling
      await rpc.sendAsync({ method: 'evm_increaseTime', params: [100] });

      // Submit ruling
      await delphiVoting.submitRuling(delphiStake.address, claimNumber, { from: arbiterAlice });

      // Claim the fee and get Alice's final balance
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterAlice });
      const finalBalanceAlice = await token.balanceOf(arbiterAlice);

      // Alice's expected final balance is her starting balance plus (20 + 13)% of the fee
      const expectedFinalBalanceAlice = '103300';
      assert.strictEqual(finalBalanceAlice.toString(10), expectedFinalBalanceAlice.toString(10),
        'Alice did not get the proper fee allocation');

      // Claim the fee and get Bob's final balance
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterBob });
      const finalBalanceBob = await token.balanceOf(arbiterBob);

      // Bob's expected final balance is his starting balance plus (16 + 13)% of the fee
      const expectedFinalBalanceBob = '102900';
      assert.strictEqual(finalBalanceBob.toString(10), expectedFinalBalanceBob.toString(10),
        'Bob did not get the proper fee allocation');

      // Claim the fee and get Charlie's final balance
      await delphiVoting.claimFee(delphiStake.address, claimNumber, PLURALITY_VOTE, SALT,
        { from: arbiterCharlie });
      const finalBalanceCharlie = await token.balanceOf(arbiterCharlie);

      // Charlie's expected final balance is his starting balance plus (12 + 13)% of the fee
      const expectedFinalBalanceCharlie = '102500';
      assert.strictEqual(finalBalanceCharlie.toString(10), expectedFinalBalanceCharlie.toString(10),
        'Charlie did not get the proper fee allocation');
    });
  });
});
