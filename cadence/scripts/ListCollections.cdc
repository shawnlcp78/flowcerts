// to be signed by Admin
import FileNFTContract from 0x02
import FilePrivilegesContract from 0x02

pub fun main(address: Address): {String: [String]} {
    let acct = getAuthAccount(address)
    let collection = acct.borrow<&FileNFTContract.FileNFTCollectionIndex>(from: /storage/fileNftIndex)!
    return collection.getItems()
}