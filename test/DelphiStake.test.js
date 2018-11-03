const DelphiStake = artifacts.require('DelphiStake')
const ERC20Mock = artifacts.require('ERC20Mock')

const config = require('./utils/config')
const shouldFail = require('./utils/shouldFail')
const { should } = require('./utils/should')
const { initializeStakeBuilder, getAccounts } = require('./utils/helpers')

const TIMESTAMP_IN_PAST = 1541171924

contract('DelphiStake', accounts => {
  const { staker, claimant, arbiter, other } = getAccounts(accounts)
  let stake, token

  const initializeStake = ({
    sender=staker,
    stakerAddress=staker,
    value=config.initialStake,
    tokenAddress=token.address,
    data=config.data,
    releaseTime=config.releaseTime
  } = {}) => stake.initializeStake(
    stakerAddress,
    value,
    tokenAddress,
    data,
    releaseTime,
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

  beforeEach(async () => {
      stake = await DelphiStake.new()
      token = await ERC20Mock.new(staker, config.initialStake*10)
      await token.approve(stake.address, config.initialStake, { from: staker })
      await token.transfer(claimant, config.initialStake, { from: staker });
  })

  /* -- CONSTRUCTOR -- */
  describe('constructor', () => {
    it('should instantiate the contract with correct values', async () => {
      await initializeStake()

      const claimableStake = await stake.claimableStake.call()
      const tokenAddress = await stake.token.call()
      const data = await stake.data.call()
      const releaseTime = await stake.releaseTime.call()
      const balance = await token.balanceOf(stake.address)

      claimableStake.should.be.bignumber.equal(config.initialStake)
      tokenAddress.should.be.equal(token.address)
      data.should.be.equal(config.data)
      releaseTime.should.be.bignumber.equal(config.releaseTime)
      balance.should.be.bignumber.equal(config.initialStake)
    })


    it('should revert when _value does not equal amount of tokens sent', async () => {
      await shouldFail.reverting(
        initializeStake({ value: config.initialStake + 1 })
      )
    })


    it('should revert when trying to call the initialize function more than once', async () => {
      await initializeStake()
      await shouldFail.reverting(initializeStake())
    })


    it('should revert when trying to call the initialize function with a releaseTime that is before now', async () => {
      await shouldFail.reverting(
        initializeStake({ releaseTime: TIMESTAMP_IN_PAST })
      )
    })
  })

  describe('functions', async () => {
    beforeEach(async () => initializeStake())


    /* -- WHITELIST CLAIMANT -- */
    describe('whitelistClaimant', () => {
      it('should properly add claimants', async () => {
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


      it('should properly emit ClaimantWhitelisted event', async () => {
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


    /* -- OPEN CLAIM -- */
    describe('openClaim', async () => {
      beforeEach(async () => {
        whitelistClaimant()
        await token.approve(stake.address, config.minFee, { from: claimant });
      })


      it('should properly open new claim', async () => {
        await openClaim()
        const claimsLength = await stake.getClaimsLength()
        claimsLength.should.be.bignumber.equal(1)

        const claim = await stake.claims(0)
        claim[0].should.be.bignumber.equal(0)
        claim[1].should.be.equal(claimant)
        claim[2].should.be.bignumber.equal(config.claimAmount)
        claim[3].should.be.bignumber.equal(config.minFee)
        claim[4].should.be.bignumber.equal(0)
        claim[5].should.be.equal(config.data)
        claim[6].should.be.bignumber.equal(0)
        claim[7].should.be.equal(false)

        const claimableStake = await stake.claimableStake.call()
        claimableStake.should.be.bignumber.equal(config.initialStake - config.minFee - config.claimAmount)
      })


      it('should properly emit ClaimOpened event', async () => {
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
  })
})