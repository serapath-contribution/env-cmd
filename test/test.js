'use strict'

const assert = require('better-assert')
const describe = require('mocha').describe
const it = require('mocha').it
const afterEach = require('mocha').afterEach
const beforeEach = require('mocha').beforeEach
const before = require('mocha').before
const after = require('mocha').after
const path = require('path')
const proxyquire = require('proxyquire')
const sinon = require('sinon')
const fs = require('fs')

const spawnStub = sinon.spy(() => ({
  on: sinon.stub(),
  exit: sinon.stub(),
  kill: sinon.stub()
}))

const lib = proxyquire('../lib', {
  'cross-spawn': {
    spawn: spawnStub
  },
  [path.resolve(process.cwd(), 'test/.env.json')]: {
    BOB: 'COOL',
    NODE_ENV: 'dev',
    ANSWER: '42'
  },
  [path.resolve(process.cwd(), 'test/.env.js')]: {
    BOB: 'COOL',
    NODE_ENV: 'dev',
    ANSWER: '42'
  }
})
const EnvCmd = lib.EnvCmd
const ParseArgs = lib.ParseArgs
const ParseEnvString = lib.ParseEnvString
const PrintHelp = lib.PrintHelp
const HandleUncaughtExceptions = lib.HandleUncaughtExceptions
const StripComments = lib.StripComments
const StripEmptyLines = lib.StripEmptyLines
const StripDoubleQuotes = lib.StripDoubleQuotes
const ParseEnvVars = lib.ParseEnvVars

describe('env-cmd', function () {
  describe('ParseArgs', function () {
    it('should parse out the envfile', function () {
      const parsedArgs = ParseArgs(['./test/envFile', 'command', 'cmda1', 'cmda2'])
      assert(parsedArgs.envFile === './test/envFile')
    })

    it('should parse out the command', function () {
      const parsedArgs = ParseArgs(['./test/envFile', 'command', 'cmda1', 'cmda2'])
      assert(parsedArgs.command === 'command')
    })

    it('should parse out the command args', function () {
      const parsedArgs = ParseArgs(['./test/envFile', 'command', 'cmda1', 'cmda2'])
      assert(parsedArgs.commandArgs.length === 2)
      assert(parsedArgs.commandArgs[0] === 'cmda1')
      assert(parsedArgs.commandArgs[1] === 'cmda2')
    })

    it('should error out if incorrect number of args passed', function () {
      try {
        ParseArgs(['./test/envFile'])
      } catch (e) {
        assert(e.message === 'Error! Too few arguments passed to env-cmd.')
        return
      }
      assert(!'No exception thrown')
    })
  })

  describe('ParseEnvString', function () {
    it('should parse env vars and merge (overwrite) with process.env vars', function () {
      process.env.TEST = 'SOME TEST VAR'
      process.env.NODE_ENV = 'development'
      const env = ParseEnvString('BOB=COOL\nNODE_ENV=dev\nANSWER=42\n')
      assert(env.BOB === 'COOL')
      assert(env.NODE_ENV === 'dev')
      assert(env.ANSWER === '42')
      assert(env.TEST === 'SOME TEST VAR')
    })
  })

  describe('StripComments', function () {
    it('should strip out all full line comments', function () {
      const envString = StripComments('#BOB=COOL\nNODE_ENV=dev\nANSWER=42 AND COUNTING\n#AnotherComment\n')
      assert(envString === '\nNODE_ENV=dev\nANSWER=42 AND COUNTING\n\n')
    })

    it('should strip out all inline comments and preceding spaces', function () {
      const envString = StripComments('BOB=COOL#inline1\nNODE_ENV=dev #cool\nANSWER=42 AND COUNTING  #multiple-spaces\n')
      assert(envString === 'BOB=COOL\nNODE_ENV=dev\nANSWER=42 AND COUNTING\n')
    })

    it('should not strip out values that are surrouned in double quotes', function () {
      const envString = StripComments('BOB="#COOL"#inline1\nNODE_ENV=dev #cool\nANSWER="#42 AND COUNTING"  #multiple-spaces\n')
      assert(envString === 'BOB="#COOL"\nNODE_ENV=dev\nANSWER="#42 AND COUNTING"\n')
    })
  })

  describe('StripEmptyLines', function () {
    it('should strip out all empty lines', function () {
      const envString = StripEmptyLines('\nBOB=COOL\n\nNODE_ENV=dev\n\nANSWER=42 AND COUNTING\n\n')
      assert(envString === 'BOB=COOL\nNODE_ENV=dev\nANSWER=42 AND COUNTING\n')
    })
  })

  describe('StripDoubleQuotes', function () {
    it('should strip out single double quotes', function () {
      const envString = StripDoubleQuotes(`BOB="#COOL"\nNODE_ENV=dev\nANSWER="42 AND #COUNTING"\nCOOL=""quoted""\nAwesome="'singles'"`)
      assert(envString === `BOB=#COOL\nNODE_ENV=dev\nANSWER=42 AND #COUNTING\nCOOL="quoted"\nAwesome='singles'`)
    })
  })

  describe('ParseEnvVars', function () {
    it('should parse out all env vars in string when not ending with \'\\n\'', function () {
      const envVars = ParseEnvVars('BOB=COOL\nNODE_ENV=dev\nANSWER=42 AND COUNTING')
      assert(envVars.BOB === 'COOL')
      assert(envVars.NODE_ENV === 'dev')
      assert(envVars.ANSWER === '42 AND COUNTING')
    })

    it('should parse out all env vars in string with format \'key=value\'', function () {
      const envVars = ParseEnvVars('BOB=COOL\nNODE_ENV=dev\nANSWER=42 AND COUNTING\n')
      assert(envVars.BOB === 'COOL')
      assert(envVars.NODE_ENV === 'dev')
      assert(envVars.ANSWER === '42 AND COUNTING')
    })

    it('should parse out all env vars in string with format \'key value\'', function () {
      const envVars = ParseEnvVars('BOB COOL\nNODE_ENV dev\nANSWER 42 AND COUNTING\n')
      assert(envVars.BOB === 'COOL')
      assert(envVars.NODE_ENV === 'dev')
      assert(envVars.ANSWER === '42 AND COUNTING')
    })

    it('should parse out all env vars in string with mixed format \'key=value\' & \'key value\'', function () {
      const envVars = ParseEnvVars('BOB=COOL\nNODE_ENV dev\nANSWER=42 AND COUNTING\n')
      assert(envVars.BOB === 'COOL')
      assert(envVars.NODE_ENV === 'dev')
      assert(envVars.ANSWER === '42 AND COUNTING')
    })

    it('should ignore invalid lines', function () {
      const envVars = ParseEnvVars('BOB=COOL\nTHISIS$ANDINVALIDLINE\nANSWER=42 AND COUNTING\n')
      assert(Object.keys(envVars).length === 2)
      assert(envVars.BOB === 'COOL')
      assert(envVars.ANSWER === '42 AND COUNTING')
    })
  })

  describe('JSON and JS format support', function () {
    before(function () {
      this.readFileStub = sinon.stub(fs, 'readFileSync')
      proxyquire.noCallThru()
    })
    after(function () {
      this.readFileStub.restore()
      proxyquire.callThru()
    })
    afterEach(function () {
      spawnStub.reset()
    })
    it('should parse env vars from JSON with node module loader if file extension is .json', function () {
      EnvCmd(['./test/.env.json', 'echo', '$BOB'])
      assert(spawnStub.args[0][0] === 'echo')
      assert(spawnStub.args[0][1][0] === '$BOB')
      assert(spawnStub.args[0][2].env.BOB === 'COOL')
      assert(spawnStub.args[0][2].env.NODE_ENV === 'dev')
      assert(spawnStub.args[0][2].env.ANSWER === '42')
    })
    it('should parse env vars from JavaScript with node module loader if file extension is .js', function () {
      EnvCmd(['./test/.env.js', 'echo', '$BOB'])
      assert(spawnStub.args[0][0] === 'echo')
      assert(spawnStub.args[0][1][0] === '$BOB')
      assert(spawnStub.args[0][2].env.BOB === 'COOL')
      assert(spawnStub.args[0][2].env.NODE_ENV === 'dev')
      assert(spawnStub.args[0][2].env.ANSWER === '42')
    })
  })

  describe('.RC file support (.env-cmdrc)', function () {
    before(function () {
      this.readFileStub = sinon.stub(fs, 'readFileSync')
      this.readFileStub.returns(`{
        "development": {
          "BOB": "COOL",
          "NODE_ENV": "dev",
          "ANSWER": "42"
        },
        "production": {
          "BOB": "COOL",
          "NODE_ENV": "prod",
          "ANSWER": "43"
        }
      }`)
      this.existsSyncStub = sinon.stub(fs, 'existsSync')
      this.existsSyncStub.returns(true)
      proxyquire.noCallThru()
    })
    after(function () {
      this.readFileStub.restore()
      this.existsSyncStub.restore()
      proxyquire.callThru()
    })
    afterEach(function () {
      spawnStub.reset()
    })
    it('should parse env vars from .env-cmdrc file using development env', function () {
      EnvCmd(['development', 'echo', '$BOB'])
      assert(spawnStub.args[0][0] === 'echo')
      assert(spawnStub.args[0][1][0] === '$BOB')
      assert(spawnStub.args[0][2].env.BOB === 'COOL')
      assert(spawnStub.args[0][2].env.NODE_ENV === 'dev')
      assert(spawnStub.args[0][2].env.ANSWER === '42')
    })
    it('should parse env vars from .env-cmdrc file using production env', function () {
      EnvCmd(['production', 'echo', '$BOB'])
      assert(spawnStub.args[0][0] === 'echo')
      assert(spawnStub.args[0][1][0] === '$BOB')
      assert(spawnStub.args[0][2].env.BOB === 'COOL')
      assert(spawnStub.args[0][2].env.NODE_ENV === 'prod')
      assert(spawnStub.args[0][2].env.ANSWER === '43')
    })
  })

  describe('EnvCmd', function () {
    before(function () {
      this.readFileStub = sinon.stub(fs, 'readFileSync')
    })
    after(function () {
      this.readFileStub.restore()
    })
    afterEach(function () {
      spawnStub.reset()
      this.readFileStub.reset()
    })
    it('should spawn a new process with the env vars set', function () {
      this.readFileStub.returns('BOB=COOL\nNODE_ENV=dev\nANSWER=42\n')
      EnvCmd(['./test/.env', 'echo', '$BOB'])
      assert(this.readFileStub.args[0][0] === path.join(process.cwd(), 'test/.env'))
      assert(spawnStub.args[0][0] === 'echo')
      assert(spawnStub.args[0][1][0] === '$BOB')
      assert(spawnStub.args[0][2].env.BOB === 'COOL')
      assert(spawnStub.args[0][2].env.NODE_ENV === 'dev')
      assert(spawnStub.args[0][2].env.ANSWER === '42')
    })

    it('should throw error if file and fallback does not exist', function () {
      this.readFileStub.restore()

      try {
        EnvCmd(['./test/.non-existent-file', 'echo', '$BOB'])
      } catch (e) {
        const resolvedPath = path.join(process.cwd(), '.env')
        assert(e.message ===`Error! Could not fallback to find or read file at ${resolvedPath}`)
        return
      }
      assert(!'No exception thrown')
    })
  })

  describe('PrintHelp', function () {
    it('should return help text when run', function () {
      const helpText = PrintHelp()
      assert(typeof helpText === 'string')
      assert(helpText.match(/Usage/g).length !== 0)
      assert(helpText.match(/env-cmd/).length !== 0)
      assert(helpText.match(/env_file/).length !== 0)
      assert(helpText.match(/env_name/).length !== 0)
    })
  })

  describe('HandleUncaughtExceptions', function () {
    beforeEach(function () {
      this.logStub = sinon.stub(console, 'log')
      this.processStub = sinon.stub(process, 'exit')
    })
    afterEach(function () {
      this.logStub.restore()
      this.processStub.restore()
    })
    it('should print help text and error if error contains \'passed\'', function () {
      HandleUncaughtExceptions(new Error('print help text passed now'))
      assert(this.logStub.calledTwice)
      this.logStub.restore()  // restore here so test success logs get printed
    })

    it('should print just there error if error does not contain \'passed\'', function () {
      HandleUncaughtExceptions(new Error('do not print help text now'))
      assert(this.logStub.calledOnce)
      this.logStub.restore()  // restore here so test success logs get printed
    })
  })
})
