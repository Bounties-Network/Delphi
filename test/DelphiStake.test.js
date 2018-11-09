const DelphiStake = artifacts.require('DelphiStake')
const ERC20Mock = artifacts.require('ERC20Mock')

const config = require('./utils/config')
const shouldFail = require('./utils/shouldFail')
const { should } = require('./utils/should')
const {
  initializeStakeBuilder,
  getAccounts,
  advanceTimeAndBlock,
  getBlockNumber,
  getBlock
} = require('./utils/helpers')

const TIMESTAMP_IN_PAST = 1541171924

contract('DelphiStake', accounts => {
  const { staker, claimant, arbiter, other } = getAccounts(accounts)
  let stake, token, stakeReleaseTime

  const initializeStake = ({
    sender=staker,
    stakerAddress=staker,
    value=config.initialStake,
    tokenAddress=token.address,
    releaseTime=stakeReleaseTime,
    data=config.data,
  } = {}) => stake.initializeStake(
    stakerAddress,
    value,
    tokenAddress,
    releaseTime,
    data,
    { from: sender }
  )

  const whitelistClaimant = ({
    sender=staker,
    claimantAddress=claimant,
    arbiterAddress=arbiter,
    minFee=config.minFee,
    deadline=config.claimDeadline,
    data=config.data
  } = {}) => stake.whitelistClaimant(
    claimantAddress,
    arbiterAddress,
    minFee,
    deadline,
    data,
    { from: sender }
  )

  const extendDeadline = ({
    sender=staker,
    whitelistId=0,
    newDeadline=(config.claimDeadline * 2)
  } = {}) => stake.extendDeadline(whitelistId, newDeadline, { from: sender })

  const openClaim = ({
    sender=claimant,
    whitelistId=0,
    amount=config.claimAmount,
    fee=config.minFee,
    data=config.data
  } = {}) => stake.openClaim(
    whitelistId,
    amount,
    fee,
    data,
    { from: sender }
  )

  const proposeSettlement = ({
    sender=staker,
    claimId=0,
    amount=config.settlementAmount
  }={}) => stake.proposeSettlement(claimId, amount, { from: sender })

  const acceptSettlement = ({
    sender=staker,
    claimId=0,
    settlementId=0
  }={}) => stake.acceptSettlement(claimId, settlementId, { from: sender })

  const settlementFailed = ({
    sender=staker,
    claimId=0,
    data=config.data
  }={}) => stake.settlementFailed(claimId, data, { from: sender })

  const acceptClaim = ({ sender=staker, claimId=0 } = {}) => stake.acceptClaim(claimId, { from: sender })

  const addSurplusFee = ({
    sender=staker,
    claimId=0,
    amount=config.minFee
  } = {}) => stake.addSurplusFee(claimId, amount, { from: sender })

  const increaseStake = ({
    sender=staker,
    value=config.initialStake
  } = {}) => stake.increaseStake(value, { from: sender })

  const extendReleaseTime = ({
    sender=staker,
    releaseTime=(stakeReleaseTime * 2)
  } = {}) => stake.extendReleaseTime(releaseTime, { from: sender })

  const withdrawStake = ({
    sender=staker,
    amount=config.initialStake
  } = {}) => stake.withdrawStake(amount, { from: sender })

  const ruleOnClaim = ({
    sender=arbiter,
    claimId=0,
    ruling=1
  } = {}) => stake.ruleOnClaim(claimId, ruling, { from: sender })


  beforeEach(async () => {
    stake = await DelphiStake.new()
    token = await ERC20Mock.new(staker, config.tokenSupply)
    await token.approve(stake.address, config.initialStake, { from: staker })
    await token.transfer(claimant, config.claimantBalance, { from: staker })
    await token.approve(stake.address, config.minFee, { from: claimant })
    stakeReleaseTime = (await getBlock(await getBlockNumber())).timestamp + 100
  })

  /* -- CONSTRUCTOR -- */
  describe('constructor', () => {
    it('should instantiate the contract with correct values', async () => {
      await initializeStake({ releaseTime: stakeReleaseTime })

      const claimableStake = await stake.claimableStake.call()
      const tokenAddress = await stake.token.call()
      const data = await stake.data.call()
      const releaseTime = await stake.releaseTime.call()
      const balance = await token.balanceOf(stake.address)

      claimableStake.should.be.bignumber.equal(config.initialStake)
      tokenAddress.should.be.equal(token.address)
      data.should.be.equal(config.data)
      releaseTime.should.be.bignumber.equal(stakeReleaseTime)
      balance.should.be.bignumber.equal(config.initialStake)
    })

    it('should revert when _value does not equal amount of tokens sent', async () => {
      await shouldFail.reverting(initializeStake({ value: config.initialStake + 1 }))
    })

    it('should revert when trying to call the initialize function more than once', async () => {
      await initializeStake()
      await shouldFail.reverting(initializeStake())
    })

    it('should revert when trying to call the initialize function with a releaseTime that is before now', async () => {
      await shouldFail.reverting(initializeStake({ releaseTime: TIMESTAMP_IN_PAST }))
    })
  })


  describe('functions', async () => {
    beforeEach(async () => await initializeStake({ releaseTime: stakeReleaseTime }))

    /* -- WHITELIST CLAIMANT -- */
    describe('whitelistClaimant', () => {
      it('should add claimants', async () => {
        await whitelistClaimant()
        let whitelistee = await stake.whitelist(0)

        whitelistee[0].should.be.equal(claimant)
        whitelistee[1].should.be.equal(arbiter)
        whitelistee[2].should.be.bignumber.equal(config.minFee)
        whitelistee[3].should.be.bignumber.equal(config.claimDeadline)
        whitelistee[4].should.be.equal(config.data)

        await whitelistClaimant({claimantAddress: other})
        whitelistee = await stake.whitelist(1)

        whitelistee[0].should.be.equal(other)
        whitelistee[1].should.be.equal(arbiter)
        whitelistee[2].should.be.bignumber.equal(config.minFee)
        whitelistee[3].should.be.bignumber.equal(config.claimDeadline)
        whitelistee[4].should.be.equal(config.data)

        const whitelistLength = await stake.getWhitelistLength()
        whitelistLength.should.be.bignumber.equal(2)
      })

      it('should emit ClaimantWhitelisted event', async () => {
        whitelistClaimant().then(status => status.logs[0].event.should.be.equal('ClaimantWhitelisted'))
      })

      it('should revert if called by arbiter', async () => {
        await shouldFail.reverting(
          whitelistClaimant({ claimantAddress: arbiter })
        )
      })

      it('should revert if called by anyone other than staker', async () => {
        await shouldFail.reverting(
          whitelistClaimant({ sender: other })
        )
      })


      it('should revert if staker trys to whitelist themselves', async () => {
        await shouldFail.reverting(
          whitelistClaimant({ claimantAddress: staker })
        )
      })
    })


    /* -- EXTEND DEADLINE -- */
    describe('extendDeadline', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
      })

      it('should extendDeadline', async () => {
        await extendDeadline()
        const deadline = (await stake.whitelist(0))[3]
        deadline.should.be.bignumber.equal(config.claimDeadline * 2)
      })

      it('should revert if called by user other than staker', async () => {
        await shouldFail.reverting(extendDeadline({ sender: claimant }))
        await shouldFail.reverting(extendDeadline({ sender: other }))
      })

      it('should revert if new deadline is less than or equal to old', async () => {
        await shouldFail.reverting(extendDeadline({ newDeadline: config.claimDeadline }))
      })
    })


    /* -- OPEN CLAIM -- */
    describe('openClaim', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
      })

      it('should open new claim', async () => {
        await openClaim()
        let claim = await stake.claims(0)
        claim[0].should.be.bignumber.equal(0)
        claim[1].should.be.equal(claimant)
        claim[2].should.be.bignumber.equal(config.claimAmount)
        claim[3].should.be.bignumber.equal(config.minFee)
        claim[4].should.be.bignumber.equal(0)
        claim[5].should.be.equal(config.data)
        claim[6].should.be.bignumber.equal(0)
        claim[7].should.be.equal(false)

        await token.approve(stake.address, config.minFee + 1, { from: claimant });
        await openClaim({ fee: config.minFee + 1 })
        claim = await stake.claims(1)
        claim[0].should.be.bignumber.equal(0)
        claim[1].should.be.equal(claimant)
        claim[2].should.be.bignumber.equal(config.claimAmount)
        claim[3].should.be.bignumber.equal(config.minFee + 1)
        claim[4].should.be.bignumber.equal(0)
        claim[5].should.be.equal(config.data)
        claim[6].should.be.bignumber.equal(0)
        claim[7].should.be.equal(false)

        const claimsLength = await stake.getClaimsLength()
        claimsLength.should.be.bignumber.equal(2)

        const claimableStake = await stake.claimableStake.call()
        claimableStake.should.be.bignumber
          .equal(config.initialStake - (2*config.minFee) - 1 - (2*config.claimAmount))
      })

      it('should emit ClaimOpened event', async () => {
        openClaim().then(status => status.logs[0].event.should.be.equal('ClaimOpened'))
      })

      it('should revert if claim is opened after deadline', async () => {
        whitelistClaimant({ claimantAddress: other, deadline: TIMESTAMP_IN_PAST })
        await shouldFail.reverting(openClaim({ whitelistId: 1 }))
      })

      it('should revert if non-whitelisted address attempts to open claim', async () => {
        await shouldFail.reverting(
          openClaim({ sender: other })
        )
      })

      it('should revert if fee is less than minFee', async () => {
        await shouldFail.reverting(
          openClaim({ fee: config.minFee - 1 })
        )
      })
    })


    /* -- PROPOSE SETTLEMENT -- */
    describe('proposeSettlement', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
        await openClaim()
      })

      it('should propose settlement as staker', async () => {
        await proposeSettlement()
        const [amount, stakerAgrees, claimantAgrees] = await stake.settlements.call(0, 0)

        amount.should.be.bignumber.equal(config.settlementAmount)
        stakerAgrees.should.be.equal(true)
        claimantAgrees.should.be.equal(false)
      })

      it('should propose settlement as claimant', async () => {
        await proposeSettlement({ sender: claimant })
        const [amount, stakerAgrees, claimantAgrees] = await stake.settlements.call(0, 0)

        amount.should.be.bignumber.equal(config.settlementAmount)
        stakerAgrees.should.be.equal(false)
        claimantAgrees.should.be.equal(true)
      })

      it('should emit SettlementProposed event', async () => {
        proposeSettlement().then(status => status.logs[0].event.should.be.equal('SettlementProposed'))
      })

      it('should revert if settlement not proposed by either staker or claimant', async () => {
        await shouldFail.reverting(proposeSettlement({ sender: other }))
      })

      it('should revert when settlement amount is greater than original claim amount', async () => {
        await shouldFail.reverting(proposeSettlement({ amount: config.minFee + config.claimAmount + 1 }))
      })

      it('should revert on invalid claimId', async () => {
        await shouldFail.reverting(proposeSettlement({ claimId: 1 }))
      })

      it('should revert if settlement has already failed', async () => {
        await settlementFailed()
        await shouldFail.reverting(proposeSettlement())
      })
    })


    /* -- ACCEPT SETTLEMENT -- */
    describe('acceptSettlement', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
        await openClaim()
        await proposeSettlement()
      })

      it('should accept settlement as staker', async () => {
        await proposeSettlement({ sender: claimant })
        await acceptSettlement({ settlementId: 1 })

        const amount = await token.balanceOf.call(claimant)
        const claimableStake = await stake.claimableStake.call()
        const openClaims = await stake.openClaims.call()
        const settlementsLength = await stake.getSettlementsLength.call(0)

        amount.should.be.bignumber.equal(config.claimantBalance + config.settlementAmount)
        claimableStake.should.be.bignumber.equal(config.initialStake - config.settlementAmount)
        openClaims.should.be.bignumber.equal(0)
        settlementsLength.should.be.bignumber.equal(2)
      })

      it('should accept settlement as claimant', async () => {
        await acceptSettlement({ sender: claimant })

        const amount = await token.balanceOf.call(claimant)
        const claimableStake = await stake.claimableStake.call()
        const openClaims = await stake.openClaims.call()

        claimableStake.should.be.bignumber.equal(config.initialStake - config.settlementAmount)
        amount.should.be.bignumber.equal(config.claimantBalance + config.settlementAmount)
        openClaims.should.be.bignumber.equal(0)
      })

      it('should revert if user other than staker/claimant attempts to accept', async () => {
        await shouldFail.reverting(acceptSettlement({ sender: other }))
      })

      it('should revert on invalid claimId', async () => {
        await shouldFail.reverting(acceptSettlement({ claimId: 1 }))
      })

      it('should revert on invalid settlementId', async () => {
        await shouldFail.reverting(acceptSettlement({ settlementId: 1 }))
      })

      it('should revert if settlement has already failed', async () => {
        await settlementFailed()
        await shouldFail.reverting(acceptSettlement())
      });

      it('should revert if staker attempts to accept their own settlement', async () => {
        await shouldFail.reverting(acceptSettlement({ sender: staker }))
      })

      it('should revert if claimant attempts to accept their own settlement', async () => {
        await proposeSettlement({ sender: claimant })
        await shouldFail.reverting(acceptSettlement({ settlementId: 1, sender: claimant }))
      })

    })


    /* -- SETTLEMENT FAILED -- */
    describe('settlementFailed', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
        await openClaim()
        await proposeSettlement()
      })

      it('should reject settlement as staker', async () => {
        await settlementFailed()
        const didSettlementFail = (await stake.claims(0))[7]
        didSettlementFail.should.be.equal(true)
      })

      it('should reject settlement as claimant', async () => {
        await settlementFailed({ sender: claimant })
        const didSettlementFail = (await stake.claims(0))[7]
        didSettlementFail.should.be.equal(true)
      })

      it('should revert if user other than staker/claimant attempts to reject settlement', async () => {
        await shouldFail.reverting(settlementFailed({ sender: other }))
      })

      it('should revert on invalid claimId', async () => {
        await shouldFail.reverting(settlementFailed({ claimId: 1 }))
      })

      it('should revert if settlment already failed', async () => {
        await settlementFailed()
        await shouldFail.reverting(settlementFailed())
      })
    })


    /* -- ACCEPT CLAIM -- */
    describe('acceptClaim', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
        await openClaim()
      })

      it('should accept an open claim', async () => {
        await acceptClaim()
      })

      it('should emit ClaimAccepted event', async () => {
        acceptClaim().then(status => status.logs[0].event.should.be.equal('ClaimAccepted'))
      })

      it('should revert if user other than staker attempts to accept claim', async () => {
        await shouldFail.reverting(acceptClaim({ sender: other }))
      })

      it('should revert on invalid claimId', async () => {
        await shouldFail.reverting(acceptClaim({ claimId: 1 }))
      })

      it('should revert if settlement has already failed', async () => {
        await settlementFailed()
        await shouldFail.reverting(acceptClaim())
      })
    })


    /* -- ADD SURPLUS FEE -- */
    describe('addSurplusFee', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
        await openClaim()
        await settlementFailed()
        await token.approve(stake.address, config.minFee, { from: staker })
        await token.approve(stake.address, config.minFee, { from: claimant })
      })

      it('should add surplus fee to claim as staker', async () => {
        await addSurplusFee()
        const surplusFee = (await stake.claims(0))[4]
        surplusFee.should.be.bignumber.equal(config.minFee)
      })

      it('should add surplus fee to claim as claimant', async () => {
        await addSurplusFee({ sender: claimant })
        const surplusFee = (await stake.claims(0))[4]
        surplusFee.should.be.bignumber.equal(config.minFee)
      })

      it('should revert if settlement has not failed', async () => {
        await openClaim()
        await shouldFail.reverting(addSurplusFee({ claimId: 1 }))
      })

      it('should revert if claim is already ruled on', async () => {
        await ruleOnClaim()
        await shouldFail.reverting(addSurplusFee())
      })
    })


    /* -- INCREASE STAKE -- */
    describe('increaseStake', async () => {
      beforeEach(async () => {
        await token.approve(stake.address, config.initialStake, { from: staker })
      })

      it('should increase stake', async () => {
        await increaseStake()

        const claimableStake = await stake.claimableStake.call()
        const balance = await token.balanceOf(stake.address)

        claimableStake.should.be.bignumber.equal(2 * config.initialStake)
        balance.should.be.bignumber.equal(2 * config.initialStake)
      })

      it('should revert if staker didn\'t approve enough tokens', async () => {
        await shouldFail.reverting(increaseStake({ value: config.initialStake + 1}))
      })

      it('should revert if a user other than the staker attempts to increase stake', async () => {
        await shouldFail.reverting(increaseStake({ sender: other }))
      })
    })


    /* -- EXTEND RELEASE TIME -- */
    describe('extendReleaseTime', async () => {
      it('should extend releaseTime', async () => {
        await extendReleaseTime()
        const releaseTime = await stake.releaseTime.call()
        releaseTime.should.be.bignumber.equal(2 * stakeReleaseTime)
      })

      it('should revert if called by user other than staker', async () => {
        await shouldFail.reverting(extendReleaseTime({ sender: other }))
      })

      it('should revert if new release time is the same or less than old', async () => {
        await shouldFail.reverting(extendReleaseTime({ releaseTime: stakeReleaseTime }))
      })
    })

    /* -- WITHDRAW STAKE -- */
    describe('withdrawStake', async () => {
      let balanceBefore

      beforeEach(async () => balanceBefore = await token.balanceOf(staker))

      it('should withdraw stake', async () => {
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [1000], id: 0})
        await withdrawStake()
        const balance = await token.balanceOf(staker)
        const claimableStake = await stake.claimableStake.call()

        balance.should.be.bignumber.equal(balanceBefore.add(config.initialStake))
        claimableStake.should.be.bignumber.equal(0)
      })

      it('should revert if anyone else tries to withdraw stake', async () => {
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [1000], id: 0})
        await shouldFail.reverting(withdrawStake({ sender: other }))
      })

      it('should revert if requested withdrawal amount is greater than the claimable stake', async () => {
        await web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [1000], id: 0})
        await shouldFail.reverting(withdrawStake({ amount: config.initialStake + 1 }))
      })

      it('should revert if release time has not elapsed yet', async () => {
        await shouldFail.reverting(withdrawStake())
      })
    })


    /* -- RULE ON CLAIM -- */
    describe('ruleOnClaim', async () => {
      beforeEach(async () => {
        await whitelistClaimant()
        await openClaim()
        await settlementFailed()
      })

      const JUSTIFIED = 1
      const NOT_JUSTIFIED = 2
      const COLLUSIVE = 3

      it('should set claim as justified', async () => {
        await ruleOnClaim()
        ruling = (await stake.claims(0))[6]
        claimableStake = await stake.claimableStake.call()
        claimantBalance = await token.balanceOf(claimant)
        stakerBalance = await token.balanceOf(staker)
        arbiterBalance = await token.balanceOf(arbiter)
        openClaims = await stake.openClaims.call()

        ruling.should.be.bignumber.equal(1)
        claimableStake.should.be.bignumber.equal(config.initialStake - config.claimAmount - config.minFee)
        claimantBalance.should.be.bignumber.equal(config.claimantBalance + config.claimAmount)
        stakerBalance.should.be.bignumber.equal(config.tokenSupply - config.claimantBalance - config.initialStake)
        arbiterBalance.should.be.bignumber.equal(config.minFee)
        openClaims.should.be.bignumber.equal(0)
      })

      it('should set claim as not justified', async () => {
        await ruleOnClaim({ ruling: 2 })
        ruling = (await stake.claims(0))[6]
        claimableStake = await stake.claimableStake.call()
        claimantBalance = await token.balanceOf(claimant)
        stakerBalance = await token.balanceOf(staker)
        arbiterBalance = await token.balanceOf(arbiter)
        openClaims = await stake.openClaims.call()

        ruling.should.be.bignumber.equal(2)
        claimableStake.should.be.bignumber.equal(config.initialStake)
        claimantBalance.should.be.bignumber.equal(config.claimantBalance - config.minFee)
        stakerBalance.should.be.bignumber.equal(config.tokenSupply - config.claimantBalance - config.initialStake)
        arbiterBalance.should.be.bignumber.equal(config.minFee)
        openClaims.should.be.bignumber.equal(0)
      })

      it('should set claim as collusive', async () => {
        await ruleOnClaim({ ruling: 3 })
        ruling = (await stake.claims(0))[6]
        claimableStake = await stake.claimableStake.call()
        claimantBalance = await token.balanceOf(claimant)
        stakerBalance = await token.balanceOf(staker)
        arbiterBalance = await token.balanceOf(arbiter)
        openClaims = await stake.openClaims.call()

        ruling.should.be.bignumber.equal(3)
        claimableStake.should.be.bignumber.equal(config.initialStake - config.minFee - config.claimAmount)
        claimantBalance.should.be.bignumber.equal(config.claimantBalance - config.minFee)
        stakerBalance.should.be.bignumber.equal(config.tokenSupply - config.claimantBalance - config.initialStake)
        arbiterBalance.should.be.bignumber.equal(2*config.minFee)
        openClaims.should.be.bignumber.equal(0)
      })


    })
  })
})