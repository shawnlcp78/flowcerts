import FilePrivilegesContract from "./FilePrivileges.cdc"

// FileNFT3.cdc

pub contract FileNFTContract3 {
    pub resource AccountData {
        priv let verifiedDomain: String
        priv let verifyLink: String

        priv var cCreationLeft: UInt64 // collections
        priv var sCreationLeft: UInt64 // single files

        init(verifiedDomain: String, verifyLink: String) {
            self.verifiedDomain = verifiedDomain
            self.verifyLink = verifyLink
            self.cCreationLeft = 2000
            self.sCreationLeft = 10000
        }

        pub fun getVerifiedDomain(): String { return self.verifiedDomain }
        pub fun getVerifyLink(): String { return self.verifyLink }
        pub fun getCCreationLeft(): UInt64 { return self.cCreationLeft }
        pub fun getSCreationLeft(): UInt64 { return self.sCreationLeft }

        pub fun setCCreationLeft(cCreationLeft: UInt64) {
            self.cCreationLeft = cCreationLeft
        }

        pub fun setSCreationLeft(sCreationLeft: UInt64) {
            self.sCreationLeft = sCreationLeft
        }
    }

    // Central storage for stuff that had to be verified off-chain + pricing
    pub resource FileNFTCentralStorage: AccountDataSource {
        priv var accountData: @{String: AccountData}
        priv var collectionToAccountMap: {String: String}

        init() {
            self.accountData <- {}
            self.collectionToAccountMap = {}
        }

        // This resource would only ever be owned by admin
        pub fun createCollectionCheck(accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection, collectionId: String): String {
            // Check quota
            var quota = self.accountData[accountTokenCollection.getAccountAddress()]?.getCCreationLeft()!
            if (quota < 1) { panic("insufficient") }

            // If OK, create mapping and deduct
            if (self.collectionToAccountMap.containsKey(collectionId)) { return "notUnique" }
            self.collectionToAccountMap[collectionId] = accountTokenCollection.getAccountAddress()
            self.accountData[accountTokenCollection.getAccountAddress()]?.setCCreationLeft(cCreationLeft: quota - 1)
            return "ok"
        }

        // This resource would only ever be owned by admin
        pub fun createFileCheck(accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection): String {
            // Check quota
            var quota = self.accountData[accountTokenCollection.getAccountAddress()]?.getSCreationLeft()!
            if (quota < 1) { panic("insufficient") }

            // If OK, deduct
            self.accountData[accountTokenCollection.getAccountAddress()]?.setSCreationLeft(sCreationLeft: quota - 1)
            return "ok"
        }

        // 
        pub fun updateLimits(address: String, adminCapability: &FilePrivilegesContract.FileAdminIndicator, cCreation: UInt64, sCreation: UInt64) {
            log("Check if caller has the required admin token to update account data")
            if (adminCapability.getIsAdmin() == true) {
                self.accountData[address]?.setCCreationLeft(cCreationLeft: cCreation)
                self.accountData[address]?.setSCreationLeft(sCreationLeft: sCreation)
            }
            else {
                panic("Unauthorised")
            }
        }

        pub fun getCollectionVerificationData(collectionId: String): {String: String?} {
            return {
                "verifiedDomain": self.accountData[self.collectionToAccountMap[collectionId]!]?.getVerifiedDomain(),
                "verifyLink": self.accountData[self.collectionToAccountMap[collectionId]!]?.getVerifyLink()
            }
        }

        pub fun getFullAccountData(accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection): {String: String?} {
            return {
                "verifiedDomain": self.accountData[accountTokenCollection.getAccountAddress()]?.getVerifiedDomain(),
                "verifyLink": self.accountData[accountTokenCollection.getAccountAddress()]?.getVerifyLink(),
                "cCreationLeft": self.accountData[accountTokenCollection.getAccountAddress()]?.getCCreationLeft()?.toString(),
                "sCreationLeft": self.accountData[accountTokenCollection.getAccountAddress()]?.getSCreationLeft()?.toString()
            }
        }

        pub fun adminAddAccountData(address: String, adminCapability: &FilePrivilegesContract.FileAdminIndicator, verifiedDomain: String, verifyLink: String) {
            log("Check if caller has the required admin token to add account data")
            if (adminCapability.getIsAdmin() == true) {
                self.accountData[address] <-! create AccountData(verifiedDomain: verifiedDomain, verifyLink: verifyLink)
            }
            else {
                panic("Unauthorised")
            }
        }

        destroy() {
            destroy self.accountData
        }
    }

    // Public interface to the central storage
    pub resource interface AccountDataSource {
        // Normal
        pub fun getCollectionVerificationData(collectionId: String): {String: String?}
        pub fun getFullAccountData(accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection): {String: String?}
        pub fun createCollectionCheck(accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection, collectionId: String): String
        pub fun createFileCheck(accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection): String
    }

    // Stores an index of FileNFTCollections owned by a user
    pub resource FileNFTCollectionIndex {
        priv var collections: {String: [String]}

        init() {
            self.collections = {}
        }

        pub fun addItem(id: String, name: String, description: String) {
            self.collections[id] = [name, description, getCurrentBlock().timestamp.toString()]
        }
        
        pub fun getItems(): {String: [String]} {
            return self.collections
        }
    }

    pub fun createEmptyIndex(): @FileNFTCollectionIndex {
        return <- create FileNFTCollectionIndex()
    }

    // FileNFT resource representing a single NFT
    pub resource FileNFT {
        pub let id: String
        priv var fileData: String
        priv let originalFileHash: String // original file hash is immutable

        // IN THE UNLIKELY EVENT THAT THE CENTRAL ACCOUNT IS BREACHED:
        // the worst that could happen is certificates' file data being modified, which is detectable
        // as the frontend enforces that the decrypted contents match originalFileHash, if not it'll show an error
        init(id: String, fileData: String, originalFileHash: String) {
            self.id = id
            self.fileData = fileData
            self.originalFileHash = originalFileHash
        }

        pub fun getId(): String { return self.id }
        pub fun getFileData(): String { return self.fileData }
        pub fun getOriginalFileHash(): String { return self.originalFileHash }

        pub fun setFileData(fileData: String) { self.fileData = fileData }
    }

    // FileNFTDetailed resource with additional details for a FileNFT
    pub resource FileNFTDetailed {
        pub var id: String?
        pub var fileData: String?
        pub var fileName: String?
        pub var isEncrypted: Bool?
        pub var collectionName: String?
        pub var originalFileHash: String?
        pub var isActive: Bool?
        pub var created: UInt64?

        init(id: String?, fileData: String?, fileName: String?, isEncrypted: Bool?, originalFileHash: String?, isActive: Bool?, collectionName: String?, created: UInt64?) {
            self.collectionName = collectionName
            self.id = id
            self.fileData = fileData
            self.fileName = fileName
            self.isEncrypted = isEncrypted
            self.originalFileHash = originalFileHash
            self.isActive = isActive
            self.created = created
        }
    }

    // Stores only FileNFT metadata for quick access
    pub resource FileNFTMetadata {
        priv var id: String
        priv var fileName: String
        priv var isEncrypted: Bool
        priv var isActive: Bool
        priv let created: UInt64

        init(id: String, fileName: String, isEncrypted: Bool, isActive: Bool) {
            self.id = id
            self.fileName = fileName
            self.isEncrypted = isEncrypted
            self.isActive = isActive
            self.created = UInt64(getCurrentBlock().timestamp)
        }

        pub fun getCreated(): UInt64 {
            return self.created
        }

        pub fun getFileName(): String {
            return self.fileName
        }

        pub fun getIsEncrypted(): Bool {
            return self.isEncrypted
        }

        pub fun setIsEncrypted(isEncrypted: Bool) {
            self.isEncrypted = isEncrypted
        }

        pub fun getIsActive(): Bool {
            return self.isActive
        }

        pub fun setIsActive(isActive: Bool) {
            self.isActive = isActive
        }
    }


    pub resource interface FileNFTCollectionPublicInterface {
        // public functions
        pub fun getFile(id: String): @FileNFTDetailed

        // admin access controlled
        pub fun adminSetFileData(id: String, adminCapability: &FilePrivilegesContract.FileAdminIndicator, fileData: String)
        pub fun adminSetIsEncrypted(id: String, adminCapability: &FilePrivilegesContract.FileAdminIndicator, isEncrypted: Bool)
    }

    // FileNFTCollection resource representing a collection of FileNFTs
    pub resource FileNFTCollection: FileNFTCollectionPublicInterface {
        priv var id: String
        priv var ownedNFTs: @{String: FileNFT}
        priv var metadata: @{String: FileNFTMetadata}
        priv let name: String

        init(
            id: String,
            name: String
        ) {
            self.id = id
            self.ownedNFTs <- {}
            self.metadata <- {}
            self.name = name
        }

        pub fun withdraw(id: String): @FileNFT {
            return <- self.ownedNFTs.remove(key: id)!
        }

        pub fun deposit(nft: @FileNFT) {
            self.ownedNFTs[nft.id] <-! nft
        }

        pub fun getIDs(): [String] {
            return self.ownedNFTs.keys
        }

        pub fun idExists(id: String): Bool {
            return self.ownedNFTs[id] != nil
        }

        pub fun addFileMetadata(id: String, fileName: String, isEncrypted: Bool, isActive: Bool) {
            self.metadata[id] <-! create FileNFTMetadata(id: id, fileName: fileName, isEncrypted: isEncrypted, isActive: isActive)
        }

        pub fun getFile(id: String): @FileNFTDetailed {
            return <- create FileNFTDetailed(
                id: self.ownedNFTs[id]?.id,
                fileData: self.ownedNFTs[id]?.getFileData(),
                fileName: self.metadata[id]?.getFileName(),
                isEncrypted: self.metadata[id]?.getIsEncrypted(),
                originalFileHash: self.ownedNFTs[id]?.getOriginalFileHash(),
                isActive: self.metadata[id]?.getIsActive(),
                collectionName: self.name,
                created: self.metadata[id]?.getCreated(),
            )
        }

        pub fun getFilesMetadata(): &{String: FileNFTMetadata} {
            return &self.metadata as &{String: FileNFTMetadata}
        }

        pub fun adminSetFileData(id: String, adminCapability: &FilePrivilegesContract.FileAdminIndicator, fileData: String) {
            log("Check if caller has the required admin token to modify files in this list")
            if (adminCapability.getIsAdmin() != true) { panic("Unauthorised") }
            self.ownedNFTs[id]?.setFileData(fileData: fileData)
        }

        pub fun adminSetIsEncrypted(id: String, adminCapability: &FilePrivilegesContract.FileAdminIndicator, isEncrypted: Bool) {
            log("Check if caller has the required admin token to modify files in this list")
            if (adminCapability.getIsAdmin() != true) { panic("Unauthorised") }
            self.metadata[id]?.setIsEncrypted(isEncrypted: isEncrypted)
        }

        destroy() {
            destroy self.metadata
            destroy self.ownedNFTs
        }
    }

    pub fun createEmptyCollection(
        accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection,
        id: String,
        name: String,
        index: &FileNFTCollectionIndex,
        description: String,
    ): @FileNFTCollection {
        // Check quota with central storage
        var checkResult = getAccount(0x8af0983838671200).getCapability<&AnyResource{AccountDataSource}>(/public/accountDataSource).borrow()!.createCollectionCheck(accountTokenCollection: accountTokenCollection, collectionId: id)
        log("Collection creation check result")
        log(checkResult)
        
        // Add to index
        index.addItem(id: id, name: name, description: description)

        return <- create FileNFTCollection(id: id, name: name)
    }
    
    pub resource FileNFTMinter {
        // The ID that is used to mint NFTs. it is only incremented so that NFT ids remain unique.
        pub var idCount: UInt64

        init() {
            self.idCount = 1
        }

        // mints a new NFT with a new ID and returns it to the caller
        pub fun createFile(accountTokenCollection: &FilePrivilegesContract.AccountTokenCollection, fileData: String, originalFileHash: String, id: String): @FileNFT {
            // Check quota
            var checkResult = getAccount(0x8af0983838671200).getCapability<&AnyResource{AccountDataSource}>(/public/accountDataSource).borrow()!.createFileCheck(accountTokenCollection: accountTokenCollection)
            log("File creation check result")
            log(checkResult)

            var newNFT <- create FileNFT(id: id, fileData: fileData, originalFileHash: originalFileHash)
            self.idCount = self.idCount + 1
            return <- newNFT
        }
    }

    init() {
        self.account.save(<- create FileNFTCentralStorage(), to: /storage/fileNftCentralStorage)
        self.account.link<&AnyResource{AccountDataSource}>(/public/accountDataSource, target: /storage/fileNftCentralStorage)

        self.account.save(<- create FileNFTMinter(), to: /storage/fileNftMinter)
        self.account.link<&FileNFTMinter>(/public/fileNftMinter, target: /storage/fileNftMinter)
	}
}