const DelphiStake = artifacts.require('DelphiStake')
const ERC20Mock = artifacts.require('ERC20Mock')

const config = require('./utils/config')
const shouldFail = require('./utils/shouldFail')
const { should } = require('./utils/should')
const { initializeStakeBuilder, getAccounts } = require('./utils/helpers')


contract('DelphiStake', accounts => {
  const { staker, claimant, arbiter, other } = getAccounts(accounts)
  let initializeStake, stake, token

  beforeEach(async () => {
      stake = await DelphiStake.new()
      token = await ERC20Mock.new(staker, config.initialStake)
      await token.approve(stake.address, config.initialStake, { from: staker })

      initializeStake = initializeStakeBuilder(stake, token, staker)
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
        initializeStake({ releaseTime: 1541171924 })
      )
    })
  })


  /* -- WHITELIST CLAIMANT -- */
  describe('whitelistClaimant', () => {
    beforeEach(async () => {
      initializeStake()
    })


    it('should properly add the claimant', async () => {
      await stake.whitelistClaimant(claimant, arbiter, config.minFee, config.releaseTime, config.data, { from: staker })
      const whitelistee = await stake.whitelist(0)

      whitelistee[0].should.be.equal(claimant)
      whitelistee[1].should.be.equal(arbiter)
      whitelistee[2].should.be.bignumber.equal(config.minFee)
      whitelistee[3].should.be.bignumber.equal(config.releaseTime)
      whitelistee[4].should.be.equal(config.data)
    })


    it('should revert if called by arbiter', async () => {
      await shouldFail.reverting(
        stake.whitelistClaimant(arbiter, arbiter, config.minFee, config.releaseTime, '', { from: staker })
      )
    })


    it('should revert if called by anyone other than staker', async () => {
      await shouldFail.reverting(
        stake.whitelistClaimant(claimant, arbiter, config.minFee, config.releaseTime, '', { from: other })
      )
    })


  })
})