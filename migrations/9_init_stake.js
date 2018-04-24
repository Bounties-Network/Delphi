/* global artifacts */

const DelphiVoting = artifacts.require('DelphiVoting.sol');
const DelphiStake = artifacts.require('DelphiStake.sol');
const Token = artifacts.require('tokens/eip20/EIP20.sol');

const fs = require('fs');

module.exports = (deployer, network, accounts) => {
  deployer.then(async () => {
    const ds = await DelphiStake.deployed();
    const conf = JSON.parse(fs.readFileSync('./conf/config.json'));

    let arbiter = conf.arbiter;
    let token = conf.token;

    // If we are testing, using whatever token and DV instances were deployed by this migrator,
    // and approve the DS instance to transfer from the token.
    if (network === 'test' || network === 'coverage') {
      arbiter = (await DelphiVoting.deployed()).address;
      token = (await Token.deployed()).address;

      await (await Token.at(token))
        .approve(ds.address, conf.initialStake);

    }
    return ds.initDelphiStake(conf.initialStake, token, conf.minFee, conf.data,
      conf.deadline, arbiter, {from: accounts[0]});
  });
};
