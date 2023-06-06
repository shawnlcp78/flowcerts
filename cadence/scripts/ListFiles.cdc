// to be signed by Admin
import FileNFTContract from 0x02
import FilePrivilegesContract from 0x02

pub fun main(address: Address, collectionId: String): &{UInt64: FileNFTContract.FileNFTMetadata} {
    let acct = getAuthAccount(address)
    let collection = acct.borrow<&FileNFTContract.FileNFTCollection>(from: StoragePath(identifier: "fileNftCollection_".concat(collectionId))!)!
    return collection.getFilesMetadata()
}