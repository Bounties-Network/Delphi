const Stake = artifacts.require('Stake')
const StakeFactory = artifacts.require('StakeFactory')
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

contract('StakeFactory', accounts => {
  const { staker, claimant, arbiter, other } = getAccounts(accounts)
  let factory, token, stakeReleaseTime

  const createStake = ({
    sender=staker,
    stakerAddress=staker,
    value=config.initialStake,
    tokenAddress=token.address,
    releaseTime=stakeReleaseTime,
    data=config.data,
  } = {}) => factory.createStake(
    stakerAddress,
    value,
    tokenAddress,
    releaseTime,
    data,
    { from: sender }
  )

  beforeEach(async () => {
    masterStake = await Stake.new()
    factory = await StakeFactory.new(masterStake.address)
    token = await ERC20Mock.new(staker, config.tokenSupply)
    await token.approve(factory.address, config.initialStake, { from: staker })
    await token.transfer(claimant, config.claimantBalance, { from: staker })
    // await token.approve(stake.address, config.minFee, { from: claimant })
    stakeReleaseTime = (await getBlock(await getBlockNumber())).timestamp + 100
  })

  /* -- CREATE STAKE -- */
  describe('createStake', () => {
    it('should instantiate the contract with correct values', async () => {
      const status = await createStake({ releaseTime: stakeReleaseTime })
      stake = await Stake.at(status.logs[0].args._contractAddress)

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
      await shouldFail.reverting(createStake({ value: config.initialStake + 1 }))
    })

    it('should create multiple stakes', async () => {
      await createStake()
      await token.approve(factory.address, config.initialStake, { from: staker })
      await createStake()
    })

    it('should revert when trying to create a stake with a releaseTime that is before now', async () => {
      await shouldFail.reverting(createStake({ releaseTime: TIMESTAMP_IN_PAST }))
    })
  })
})