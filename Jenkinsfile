pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                  git(
                       url: 'https://github.com/kinecosystem/marketplace-server.git',
                       branch: "${BRANCH}"
                   )
            }
        }
        stage('Create secrets for tests') {
            steps {
                echo 'Compiling'
                sh 'mkdir -p ./secrets/ && echo export STELLAR_BASE_SEED=${STELLAR_BASE_SEED} STELLAR_ADDRESS=${STELLAR_ADDRESS} > ./secrets/.secrets'
            }
        }
        stage('Create-jwt-keys') {
            steps {
                echo 'Compiling'
                sh 'make create-jwt-keys'
            }
        }
        stage('Test') {
            steps {
                echo 'Unit testing'
                //sh 'mvn test'
            }
        }
        stage ('Code Quality'){
            steps {
                echo 'Todo: sonarcube'
                echo 'Todo: Quality and security plugins (FindBugs, CheckMarx, etc.)'
            }
        }
        stage('Release') {
            steps {
                echo 'Releasing'
                sh ' mvn -B release:clean release:prepare release:perform -DdryRun=true'
                //running un dryrun since their are ni credentials set on the jenkins machine, so this will fail
                //sh 'mvn -B release:clean release:prepare release:perform'
            }
        }
        stage('DeplCreate testing env') {
            steps {
                echo 'Todo: Creating env'
            }
        }
        stage('Deploy') {
            steps {
                echo 'Todo: Deploying env'
            }
        }
        stage('Integration/System tests') {
            steps {
                echo 'Todo: Testing'
            }
        }
    }
}
