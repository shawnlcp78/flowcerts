// to be signed by Client
import FileNFTContract from 0xFileNFTContract
import FilePrivilegesContract from 0xFilePrivilegesContract

transaction {
  prepare(acct: AuthAccount) {
    acct.save(<- FileNFTContract.createEmptyIndex(), to: /storage/fileNftIndex)
  }
}
